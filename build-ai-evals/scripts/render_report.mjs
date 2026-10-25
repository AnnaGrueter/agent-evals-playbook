#!/usr/bin/env node

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptRoot = dirname(fileURLToPath(import.meta.url));
const suiteRoot = resolve(process.argv[2] || '.');
const outputPath = resolve(suiteRoot, process.argv[3] || 'eval.html');

function load(name) {
  return JSON.parse(readFileSync(resolve(suiteRoot, name), 'utf8'));
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function json(value) {
  return escapeHtml(JSON.stringify(value, null, 2));
}

const template = readFileSync(resolve(scriptRoot, '..', 'assets', 'eval-template.html'), 'utf8');
const { failure_modes: modes } = load('failure-modes.json');
const { cases } = load('cases.json');
const results = load('results.json');
const report = load('report.json');
const resultById = new Map(results.cases.map(result => [result.case_id, result]));

const failureCards = modes.map(mode => `
<article class="card">
  <div class="badge-row">
    <span class="badge">${escapeHtml(mode.id)}</span>
    <span class="badge ${mode.release_policy === 'block' ? 'fail' : mode.release_policy === 'review' ? 'warn' : ''}">${escapeHtml(mode.release_policy)}</span>
    <span class="badge">${escapeHtml(mode.source)}</span>
  </div>
  <h3>${escapeHtml(mode.name)}</h3>
  <p>${escapeHtml(mode.description)}</p>
  <p><strong>Expected:</strong> ${escapeHtml(mode.expected_behavior)}</p>
  <p class="fine">Impact: ${escapeHtml(mode.impact)}${mode.frequency ? ` · ${escapeHtml(mode.frequency)}` : ''}</p>
</article>`).join('');

const caseCards = cases.map(item => {
  const result = resultById.get(item.id);
  const status = result?.status || 'not_run';
  const observed = result?.observed === undefined ? 'Not recorded.' : `<pre>${json(result.observed)}</pre>`;
  return `
<article class="case" data-status="${escapeHtml(status)}">
  <div class="badge-row">
    <span class="badge">${escapeHtml(item.id)}</span>
    <span class="badge">${escapeHtml(item.provenance)}</span>
    <span class="badge ${status === 'pass' ? 'pass' : status === 'fail' ? 'fail' : 'warn'}">${escapeHtml(status)}</span>
  </div>
  <h3>${escapeHtml(item.feature)} · ${escapeHtml(item.failure_mode_id)}</h3>
  <p><strong>Expected behavior:</strong> ${escapeHtml(item.pass_criteria)}</p>
  <p><strong>Observed result:</strong> ${escapeHtml(status)}${result?.details ? ` · ${escapeHtml(result.details)}` : ''}</p>
  ${observed}
  <details><summary>Input and expected result</summary><h3>Input</h3><pre>${json(item.input)}</pre><h3>Expected</h3><pre>${json(item.expected)}</pre></details>
</article>`;
}).join('');

const evaluatorRows = cases.map(item => `<tr><td>${escapeHtml(item.id)}</td><td>${escapeHtml(item.failure_mode_id)}</td><td>${escapeHtml(item.evaluator.type)}</td><td>${escapeHtml(item.evaluator.operation || 'n/a')}</td></tr>`).join('');
const evaluatorTable = `<div class="table-wrap"><table><thead><tr><th>Case</th><th>Failure mode</th><th>Evaluator</th><th>Operation</th></tr></thead><tbody>${evaluatorRows}</tbody></table></div>`;

const resultRows = results.cases.map(result => `<tr><td>${escapeHtml(result.case_id)}</td><td>${escapeHtml(result.failure_mode_id)}</td><td><span class="badge ${result.status === 'pass' ? 'pass' : result.status === 'fail' ? 'fail' : 'warn'}">${escapeHtml(result.status)}</span></td><td>${result.observed === undefined ? 'Not recorded' : `<pre>${json(result.observed)}</pre>`}</td><td>${escapeHtml(result.details || '')}</td></tr>`).join('');
const resultsTable = `<div class="table-wrap"><table><thead><tr><th>Case</th><th>Failure mode</th><th>Status</th><th>Observed</th><th>Details</th></tr></thead><tbody>${resultRows}</tbody></table></div>`;

const modelSettings = results.run_context?.model_settings;
const modelSettingsDisplay = modelSettings && Object.keys(modelSettings).length > 0
  ? JSON.stringify(modelSettings)
  : String(results.run_context?.model || '').includes('fixture outputs')
    ? 'Not applicable — fixture outputs'
    : 'Not recorded';

const runContextRows = [
  ['Run status', results.run_context?.status],
  ['Model', results.run_context?.model],
  ['Model settings', modelSettingsDisplay],
  ['Contract version', results.run_context?.contract_version],
  ['Evaluator version', results.run_context?.evaluator_version],
  ['Instructions hash', results.run_context?.instructions_hash],
].map(([label, value]) => `<tr><th>${escapeHtml(label)}</th><td>${escapeHtml(value || 'Not recorded')}</td></tr>`).join('');
const runContextTable = `<div class="table-wrap"><table><tbody>${runContextRows}</tbody></table></div>`;

const values = {
  PRODUCT_NAME: escapeHtml(report.product_name),
  LAST_UPDATED: escapeHtml(report.last_updated),
  TAGLINE: escapeHtml(report.tagline),
  EVALUATION_CONTRACT: escapeHtml(report.evaluation_contract),
  TRACE_COUNT: escapeHtml(report.trace_count),
  FAILURE_MODE_COUNT: modes.length,
  CASE_COUNT: cases.length,
  LIMITATIONS: escapeHtml(report.limitations),
  RUN_CONTEXT: runContextTable,
  FAILURE_MODE_CARDS: failureCards,
  CASE_CARDS: caseCards,
  EVALUATOR_SUMMARY: escapeHtml(report.evaluator_summary),
  EVALUATOR_TABLE: evaluatorTable,
  JUDGE_CALIBRATION: escapeHtml(report.judge_calibration),
  PASSED: results.summary.passed,
  FAILED: results.summary.failed,
  TOTAL: results.summary.total,
  RELEASE_DECISION: escapeHtml(`${String(results.release_decision).toUpperCase()}: ${results.release_reason}`),
  RESULTS_TABLE: resultsTable,
};

let html = template;
for (const [key, value] of Object.entries(values)) html = html.replaceAll(`{{${key}}}`, String(value));
const leftovers = [...html.matchAll(/\{\{[A-Z0-9_]+\}\}/g)].map(match => match[0]);
if (leftovers.length) throw new Error(`Unresolved placeholders: ${[...new Set(leftovers)].join(', ')}`);

writeFileSync(outputPath, html);
console.log(`Wrote ${outputPath}`);
