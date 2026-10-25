#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { isAbsolute, relative, resolve } from 'node:path';

const root = resolve(process.argv[2] || '.');
const errors = [];

function load(name) {
  try {
    return JSON.parse(readFileSync(resolve(root, name), 'utf8'));
  } catch (error) {
    errors.push(`${name}: ${error.message}`);
    return null;
  }
}

function requireText(value, path) {
  if (typeof value !== 'string' || value.trim() === '') errors.push(`${path}: required non-empty string`);
}

function requireEnum(value, allowed, path) {
  if (!allowed.includes(value)) errors.push(`${path}: expected one of ${allowed.join(', ')}`);
}

function requireObject(value, path) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) errors.push(`${path}: required object`);
}

function requirePositiveInteger(value, path) {
  if (!Number.isInteger(value) || value < 1) errors.push(`${path}: required positive integer`);
}

function requireRate(value, path) {
  if (typeof value !== 'number' || value < 0 || value > 1) errors.push(`${path}: required number from 0 to 1`);
}

function normalizeHash(value) {
  return String(value || '').toLowerCase().replace(/^sha256:/, '');
}

function verifyManifestEntry(entry, path, expectedValue) {
  requireObject(entry, path);
  if (!entry) return;
  const hasPath = typeof entry.path === 'string' && entry.path.trim() !== '';
  const hasVersion = typeof entry.immutable_version === 'string' && entry.immutable_version.trim() !== '';
  if (hasPath === hasVersion) {
    errors.push(`${path}: require exactly one of path or immutable_version`);
    return;
  }
  if (hasVersion) {
    if (String(expectedValue) !== entry.immutable_version) errors.push(`${path}: immutable version does not match run context`);
    return;
  }

  requireText(entry.sha256, `${path}.sha256`);
  if (isAbsolute(entry.path)) {
    errors.push(`${path}.path: must be relative to the suite`);
    return;
  }
  const sourcePath = resolve(root, entry.path);
  const sourceRelative = relative(root, sourcePath);
  if (sourceRelative.startsWith('..') || isAbsolute(sourceRelative)) {
    errors.push(`${path}.path: must stay inside the suite`);
    return;
  }
  try {
    const actual = createHash('sha256').update(readFileSync(sourcePath)).digest('hex');
    if (normalizeHash(entry.sha256) !== actual) errors.push(`${path}.sha256: does not match ${entry.path}`);
    if (normalizeHash(expectedValue) !== actual) errors.push(`${path}: run-context hash does not match ${entry.path}`);
  } catch (error) {
    errors.push(`${path}.path: ${error.message}`);
  }
}

function verifySealedManifest(context, contract) {
  const manifest = load('source-manifest.json');
  if (!manifest) return;
  const sourceHashes = context.source_hashes && typeof context.source_hashes === 'object' && !Array.isArray(context.source_hashes)
    ? context.source_hashes
    : {};
  requireText(manifest.version, 'source-manifest.json.version');
  requireText(manifest.contract_version, 'source-manifest.json.contract_version');
  if (contract?.version && manifest.contract_version !== contract.version) {
    errors.push(`source-manifest.json.contract_version: expected ${contract.version}`);
  }
  verifyManifestEntry(manifest.instructions, 'source-manifest.json.instructions', context.instructions_hash);
  if (!Array.isArray(manifest.sources) || manifest.sources.length === 0) {
    errors.push('source-manifest.json.sources: required non-empty array');
    return;
  }

  const manifestNames = new Set();
  for (const [index, source] of manifest.sources.entries()) {
    const base = `source-manifest.json.sources[${index}]`;
    requireText(source?.name, `${base}.name`);
    if (!source?.name) continue;
    if (manifestNames.has(source.name)) errors.push(`${base}.name: duplicate ${source.name}`);
    manifestNames.add(source.name);
    if (!(source.name in sourceHashes)) errors.push(`${base}.name: missing from results.json.run_context.source_hashes`);
    verifyManifestEntry(source, base, sourceHashes[source.name]);
  }
  for (const name of Object.keys(sourceHashes)) {
    if (!manifestNames.has(name)) errors.push(`results.json.run_context.source_hashes.${name}: missing from source-manifest.json`);
  }
}

const modesDoc = load('failure-modes.json');
const casesDoc = load('cases.json');
const resultsDoc = load('results.json');
const reportDoc = load('report.json');

const modes = Array.isArray(modesDoc?.failure_modes) ? modesDoc.failure_modes : [];
const cases = Array.isArray(casesDoc?.cases) ? casesDoc.cases : [];
const results = Array.isArray(resultsDoc?.cases) ? resultsDoc.cases : [];

if (!Array.isArray(modesDoc?.failure_modes)) errors.push('failure-modes.json: failure_modes must be an array');
if (!Array.isArray(casesDoc?.cases)) errors.push('cases.json: cases must be an array');
if (!Array.isArray(resultsDoc?.cases)) errors.push('results.json: cases must be an array');

const contract = casesDoc?.contract;
requireObject(contract, 'cases.json.contract');
if (contract) {
  requireText(contract.version, 'cases.json.contract.version');
  requireText(contract.approved_by, 'cases.json.contract.approved_by');
  requireEnum(contract.verdict_policy, ['exact', 'within_one_step', 'custom'], 'cases.json.contract.verdict_policy');
  requireText(contract.component_variation, 'cases.json.contract.component_variation');
  if (!Array.isArray(contract.blocking_conditions) || contract.blocking_conditions.length === 0) {
    errors.push('cases.json.contract.blocking_conditions: required non-empty array');
  }
  if (!Array.isArray(contract.source_precedence) || contract.source_precedence.length === 0) {
    errors.push('cases.json.contract.source_precedence: required non-empty array');
  }
}

const modeIds = new Set();
for (const [index, mode] of modes.entries()) {
  const base = `failure_modes[${index}]`;
  requireText(mode.id, `${base}.id`);
  if (modeIds.has(mode.id)) errors.push(`${base}.id: duplicate ${mode.id}`);
  modeIds.add(mode.id);
  requireText(mode.name, `${base}.name`);
  requireText(mode.description, `${base}.description`);
  requireEnum(mode.source, ['observed', 'observed-derived', 'synthetic'], `${base}.source`);
  requireEnum(mode.impact, ['critical', 'high', 'medium', 'low'], `${base}.impact`);
  requireText(mode.expected_behavior, `${base}.expected_behavior`);
  requireEnum(mode.release_policy, ['block', 'review', 'diagnostic'], `${base}.release_policy`);
}

const caseIds = new Set();
for (const [index, item] of cases.entries()) {
  const base = `cases[${index}]`;
  requireText(item.id, `${base}.id`);
  if (caseIds.has(item.id)) errors.push(`${base}.id: duplicate ${item.id}`);
  caseIds.add(item.id);
  requireText(item.feature, `${base}.feature`);
  requireEnum(item.set, ['development', 'holdout', 'regression'], `${base}.set`);
  requireText(item.failure_mode_id, `${base}.failure_mode_id`);
  if (!modeIds.has(item.failure_mode_id)) errors.push(`${base}.failure_mode_id: unknown ${item.failure_mode_id}`);
  requireEnum(item.provenance, ['observed', 'observed-derived', 'synthetic'], `${base}.provenance`);
  if (item.provenance === 'synthetic' && (!Array.isArray(item.synthetic_dimensions) || item.synthetic_dimensions.length === 0)) {
    errors.push(`${base}.synthetic_dimensions: required for synthetic cases`);
  }
  if (item.provenance !== 'synthetic') requireText(item.trace_ref, `${base}.trace_ref`);
  if (item.input === undefined) errors.push(`${base}.input: required`);
  if (item.expected === undefined) errors.push(`${base}.expected: required`);
  requireText(item.pass_criteria, `${base}.pass_criteria`);
  requireText(item.notes, `${base}.notes`);
  requireEnum(item.evaluator?.type, ['deterministic', 'classifier', 'llm_judge', 'human'], `${base}.evaluator.type`);
  if (item.evaluator?.type === 'llm_judge') {
    const calibration = item.evaluator?.calibration;
    if (item.evaluator?.calibrated !== true) errors.push(`${base}.evaluator.calibrated: must be true for an llm_judge included in a trusted suite`);
    requireObject(calibration, `${base}.evaluator.calibration`);
    if (calibration) {
      if (calibration.human_labeled !== true) errors.push(`${base}.evaluator.calibration.human_labeled: must be true`);
      requirePositiveInteger(calibration.train_count, `${base}.evaluator.calibration.train_count`);
      requirePositiveInteger(calibration.development_count, `${base}.evaluator.calibration.development_count`);
      requirePositiveInteger(calibration.test_count, `${base}.evaluator.calibration.test_count`);
      requireRate(calibration.true_positive_rate, `${base}.evaluator.calibration.true_positive_rate`);
      requireRate(calibration.true_negative_rate, `${base}.evaluator.calibration.true_negative_rate`);
      requireText(calibration.judge_model, `${base}.evaluator.calibration.judge_model`);
      requireText(calibration.judge_prompt_version, `${base}.evaluator.calibration.judge_prompt_version`);
      requireText(calibration.escalation_rule, `${base}.evaluator.calibration.escalation_rule`);
    }
  }
}

const resultIds = new Set();
for (const [index, result] of results.entries()) {
  const base = `results.cases[${index}]`;
  requireText(result.case_id, `${base}.case_id`);
  if (!caseIds.has(result.case_id)) errors.push(`${base}.case_id: unknown ${result.case_id}`);
  if (resultIds.has(result.case_id)) errors.push(`${base}.case_id: duplicate ${result.case_id}`);
  resultIds.add(result.case_id);
  requireText(result.failure_mode_id, `${base}.failure_mode_id`);
  const sourceCase = cases.find((item) => item.id === result.case_id);
  if (sourceCase && sourceCase.failure_mode_id !== result.failure_mode_id) {
    errors.push(`${base}.failure_mode_id: expected ${sourceCase.failure_mode_id}`);
  }
  requireEnum(result.status, ['pass', 'fail', 'error', 'not_run'], `${base}.status`);
}

for (const id of caseIds) {
  if (!resultIds.has(id)) errors.push(`results.json: missing result for ${id}`);
}

if (resultsDoc) {
  requireText(resultsDoc.suite, 'results.json.suite');
  requireText(resultsDoc.run_id, 'results.json.run_id');
  requireText(resultsDoc.run_at, 'results.json.run_at');
  requireObject(resultsDoc.run_context, 'results.json.run_context');
  if (resultsDoc.run_context) {
    const context = resultsDoc.run_context;
    requireEnum(context.status, ['sealed', 'unsealed', 'example'], 'results.json.run_context.status');
    requireText(context.model, 'results.json.run_context.model');
    requireObject(context.model_settings, 'results.json.run_context.model_settings');
    requireText(context.instructions_hash, 'results.json.run_context.instructions_hash');
    requireText(context.evaluator_version, 'results.json.run_context.evaluator_version');
    requireText(context.contract_version, 'results.json.run_context.contract_version');
    requireObject(context.source_hashes, 'results.json.run_context.source_hashes');
    if (contract?.version && context.contract_version !== contract.version) {
      errors.push(`results.json.run_context.contract_version: expected ${contract.version}`);
    }
    if (context.status === 'sealed') {
      for (const [field, value] of Object.entries({model: context.model, instructions_hash: context.instructions_hash})) {
        if (String(value).toLowerCase() === 'unavailable') errors.push(`results.json.run_context.${field}: sealed runs cannot use unavailable`);
      }
      if (Object.keys(context.model_settings || {}).length === 0) errors.push('results.json.run_context.model_settings: sealed runs require recorded settings');
      const sourceEntries = Object.entries(context.source_hashes || {});
      if (sourceEntries.length === 0) errors.push('results.json.run_context.source_hashes: sealed runs require at least one source hash');
      for (const [name, value] of sourceEntries) {
        requireText(value, `results.json.run_context.source_hashes.${name}`);
        if (String(value).toLowerCase() === 'unavailable') errors.push(`results.json.run_context.source_hashes.${name}: sealed runs cannot use unavailable`);
      }
      verifySealedManifest(context, contract);
    }
  }
  requireEnum(resultsDoc.release_decision, ['pass', 'block', 'review'], 'results.json.release_decision');
  requireText(resultsDoc.release_reason, 'results.json.release_reason');
  const counts = results.reduce((acc, result) => {
    acc[result.status] = (acc[result.status] || 0) + 1;
    return acc;
  }, {});
  const expectedSummary = {
    passed: counts.pass || 0,
    failed: counts.fail || 0,
    errored: counts.error || 0,
    total: results.length,
  };
  for (const [key, value] of Object.entries(expectedSummary)) {
    if (resultsDoc.summary?.[key] !== value) errors.push(`results.json.summary.${key}: expected ${value}`);
  }

  const policyByMode = new Map(modes.map((mode) => [mode.id, mode.release_policy]));
  const unsuccessful = results.filter((result) => ['fail', 'error', 'not_run'].includes(result.status));
  const expectedDecision = unsuccessful.some((result) => policyByMode.get(result.failure_mode_id) === 'block')
    ? 'block'
    : unsuccessful.some((result) => policyByMode.get(result.failure_mode_id) === 'review')
      ? 'review'
      : 'pass';
  if (resultsDoc.release_decision !== expectedDecision) {
    errors.push(`results.json.release_decision: expected ${expectedDecision} from case statuses and failure-mode policies`);
  }
}

if (reportDoc) {
  for (const field of ['product_name', 'last_updated', 'tagline', 'evaluation_contract', 'limitations', 'evaluator_summary', 'judge_calibration']) {
    requireText(reportDoc[field], `report.json.${field}`);
  }
  if (reportDoc.trace_count === undefined || reportDoc.trace_count === null || String(reportDoc.trace_count).trim() === '') {
    errors.push('report.json.trace_count: required');
  }
}

if (errors.length) {
  console.error(`Eval suite validation failed with ${errors.length} issue(s):`);
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log(`Valid eval suite: ${modes.length} failure modes, ${cases.length} cases, ${results.length} results.`);
