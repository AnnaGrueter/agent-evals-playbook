#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const renderer = resolve(root, '../../build-ai-evals/scripts/render_report.mjs');

function load(name) {
  return JSON.parse(readFileSync(resolve(root, name), 'utf8'));
}

function hash(name) {
  return createHash('sha256').update(readFileSync(resolve(root, name))).digest('hex');
}

const { contract, cases } = load('cases.json');
const { failure_modes: failureModes } = load('failure-modes.json');
const { outputs } = load('sample-outputs.json');
const reportConfig = load('report-config.json');
const modeById = new Map(failureModes.map((mode) => [mode.id, mode]));

function deepEqual(expected, actual) {
  if (Array.isArray(expected)) {
    return Array.isArray(actual) && expected.length === actual.length && expected.every((value, index) => deepEqual(value, actual[index]));
  }
  if (expected && typeof expected === 'object') {
    return actual && typeof actual === 'object' && Object.entries(expected).every(([key, value]) => deepEqual(value, actual[key]));
  }
  return Object.is(expected, actual);
}

const caseResults = cases.map((item) => {
  const observed = outputs[item.id];
  if (observed === undefined) {
    return { case_id: item.id, failure_mode_id: item.failure_mode_id, status: 'error', details: 'Missing sample output.' };
  }
  const passed = deepEqual(item.expected, observed);
  return {
    case_id: item.id,
    failure_mode_id: item.failure_mode_id,
    status: passed ? 'pass' : 'fail',
    observed,
    ...(passed ? {} : { details: `Expected ${JSON.stringify(item.expected)}; received ${JSON.stringify(observed)}.` }),
  };
});

const summary = caseResults.reduce((counts, result) => {
  if (result.status === 'pass') counts.passed += 1;
  if (result.status === 'fail') counts.failed += 1;
  if (result.status === 'error') counts.errored += 1;
  return counts;
}, { passed: 0, failed: 0, errored: 0, total: caseResults.length });

const blockingFailures = caseResults.filter((result) =>
  ['fail', 'error'].includes(result.status) && modeById.get(result.failure_mode_id)?.release_policy === 'block');
const reviewFailures = caseResults.filter((result) =>
  ['fail', 'error'].includes(result.status) && modeById.get(result.failure_mode_id)?.release_policy === 'review');
const releaseDecision = blockingFailures.length ? 'block' : reviewFailures.length ? 'review' : 'pass';
const releaseReason = blockingFailures.length
  ? `Blocking failures remain: ${blockingFailures.map((result) => result.case_id).join(', ')}.`
  : reviewFailures.length
    ? `Review-required failures remain: ${reviewFailures.map((result) => result.case_id).join(', ')}.`
    : 'No blocking or review-required failures remain.';

const now = new Date();
const results = {
  suite: 'relationship-pipeline-sanitized-example',
  run_id: `example-${now.toISOString().replaceAll(/[-:.]/g, '')}`,
  run_at: now.toISOString(),
  run_context: {
    status: 'example',
    model: 'fixture outputs; no live model',
    model_settings: {},
    instructions_hash: 'unavailable',
    evaluator_version: 'example-v1',
    contract_version: contract.version,
    source_hashes: {
      cases: hash('cases.json'),
      failure_modes: hash('failure-modes.json'),
      sample_outputs: hash('sample-outputs.json'),
    },
  },
  cases: caseResults,
  summary,
  release_decision: releaseDecision,
  release_reason: releaseReason,
};

const report = { ...reportConfig, last_updated: now.toISOString().slice(0, 10) };
writeFileSync(resolve(root, 'results.json'), `${JSON.stringify(results, null, 2)}\n`);
writeFileSync(resolve(root, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);

const rendered = spawnSync(process.execPath, [renderer, root], { encoding: 'utf8' });
if (rendered.status !== 0) {
  process.stderr.write(rendered.stderr || rendered.stdout || 'Report rendering failed.\n');
  process.exit(2);
}

for (const result of caseResults) console.log(`${result.status.toUpperCase().padEnd(5)} ${result.case_id}${result.details ? `: ${result.details}` : ''}`);
console.log(`\n${summary.passed}/${summary.total} passed; ${summary.failed} failed; ${summary.errored} errored.`);
console.log(`Generated results.json, report.json, and eval.html. Release decision: ${releaseDecision.toUpperCase()}.`);

if (releaseDecision !== 'pass') process.exitCode = 1;
