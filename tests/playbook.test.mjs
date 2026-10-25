import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const validator = resolve(root, 'build-ai-evals/scripts/validate_eval_suite.mjs');
const renderer = resolve(root, 'build-ai-evals/scripts/render_report.mjs');
const privacyScanner = resolve(root, 'build-ai-evals/scripts/scan_public_repo.mjs');
const example = resolve(root, 'examples/relationship-pipeline');
const builderSkill = resolve(root, 'build-ai-evals/SKILL.md');
const runnerSkill = resolve(root, 'run-ai-evals/SKILL.md');

function copyExample() {
  const directory = mkdtempSync(resolve(tmpdir(), 'agent-evals-playbook-'));
  cpSync(example, directory, {recursive: true});
  return directory;
}

function copyRepository() {
  const parent = mkdtempSync(resolve(tmpdir(), 'agent-evals-playbook-repo-'));
  const directory = resolve(parent, 'repo');
  cpSync(root, directory, { recursive: true });
  return directory;
}

function hash(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function configureSealedSuite(directory) {
  const instructionsPath = resolve(directory, 'instructions.md');
  writeFileSync(instructionsPath, '# Frozen instructions\n');
  const casesHash = hash(resolve(directory, 'cases.json'));
  const instructionsHash = hash(instructionsPath);
  const resultsPath = resolve(directory, 'results.json');
  const results = JSON.parse(readFileSync(resultsPath, 'utf8'));
  results.run_context = {
    ...results.run_context,
    status: 'sealed',
    model: 'example-model-1',
    model_settings: { temperature: 0 },
    instructions_hash: instructionsHash,
    source_hashes: { cases: casesHash },
  };
  writeFileSync(resultsPath, `${JSON.stringify(results, null, 2)}\n`);
  const manifest = {
    version: '1',
    contract_version: 'example-v1',
    instructions: { path: 'instructions.md', sha256: instructionsHash },
    sources: [{ name: 'cases', path: 'cases.json', sha256: casesHash }],
  };
  writeFileSync(resolve(directory, 'source-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
}

function run(script, ...args) {
  return spawnSync(process.execPath, [script, ...args], {encoding: 'utf8'});
}

test('the sanitized example satisfies the artifact contract', () => {
  const result = run(validator, example);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Valid eval suite/);
});

test('the renderer labels expected and observed results separately', () => {
  const directory = copyExample();
  const result = run(renderer, directory);
  assert.equal(result.status, 0, result.stderr);
  const html = readFileSync(resolve(directory, 'eval.html'), 'utf8');
  assert.match(html, /<strong>Expected behavior:<\/strong>/);
  assert.match(html, /<strong>Observed result:<\/strong>/);
  assert.match(html, /Run context/);
  assert.match(html, /Not applicable — fixture outputs/);
  assert.doesNotMatch(html, />\{\}<\/td>/);
  assert.doesNotMatch(html, /\{\{[A-Z0-9_]+\}\}/);
});

test('the validator rejects a result produced under another contract version', () => {
  const directory = copyExample();
  const path = resolve(directory, 'results.json');
  const results = JSON.parse(readFileSync(path, 'utf8'));
  results.run_context.contract_version = 'stale-contract';
  writeFileSync(path, `${JSON.stringify(results, null, 2)}\n`);
  const result = run(validator, directory);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /contract_version/);
});

test('the example runner recreates every promised artifact and preserves frozen inputs', () => {
  const repository = copyRepository();
  const suite = resolve(repository, 'examples/relationship-pipeline');
  const frozen = ['cases.json', 'failure-modes.json', 'sample-outputs.json', 'report-config.json'];
  const before = new Map(frozen.map((name) => [name, hash(resolve(suite, name))]));
  for (const name of ['results.json', 'report.json', 'eval.html']) rmSync(resolve(suite, name), { force: true });

  const result = run(resolve(suite, 'run.mjs'));
  assert.equal(result.status, 1);
  assert.match(result.stdout, /5\/6 passed; 1 failed/);
  assert.match(result.stdout, /Generated results\.json, report\.json, and eval\.html/);
  for (const name of ['results.json', 'report.json', 'eval.html']) assert.equal(existsSync(resolve(suite, name)), true, `${name} was not generated`);
  for (const name of frozen) assert.equal(hash(resolve(suite, name)), before.get(name), `${name} was modified`);

  const validation = run(resolve(repository, 'build-ai-evals/scripts/validate_eval_suite.mjs'), suite);
  assert.equal(validation.status, 0, validation.stderr);
});

test('the two skills declare the build and run policy boundary', () => {
  const builder = readFileSync(builderSkill, 'utf8');
  const runner = readFileSync(runnerSkill, 'utf8');
  assert.match(builder, /must not call the live agent or model/i);
  assert.match(builder, /hand the frozen suite to `run-ai-evals`/i);
  assert.match(runner, /Do not change the contract/i);
  assert.match(runner, /Regenerate `eval\.html`/i);
});

test('the validator rejects sealed evidence without source hashes', () => {
  const directory = copyExample();
  const path = resolve(directory, 'results.json');
  const results = JSON.parse(readFileSync(path, 'utf8'));
  results.run_context.status = 'sealed';
  results.run_context.model_settings = { temperature: 0 };
  results.run_context.instructions_hash = 'sha256:example';
  results.run_context.source_hashes = {};
  writeFileSync(path, `${JSON.stringify(results, null, 2)}\n`);
  const result = run(validator, directory);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /sealed runs require at least one source hash/);
});

test('the validator derives the release decision from case results and policies', () => {
  const directory = copyExample();
  const path = resolve(directory, 'results.json');
  const results = JSON.parse(readFileSync(path, 'utf8'));
  results.release_decision = 'pass';
  results.release_reason = 'No failures block release.';
  writeFileSync(path, `${JSON.stringify(results, null, 2)}\n`);
  const result = run(validator, directory);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /release_decision: expected block/);
});

test('the validator requires a source manifest for sealed evidence', () => {
  const directory = copyExample();
  configureSealedSuite(directory);
  rmSync(resolve(directory, 'source-manifest.json'));
  const result = run(validator, directory);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /source-manifest\.json/);
});

test('the validator recomputes local hashes for sealed evidence', () => {
  const directory = copyExample();
  configureSealedSuite(directory);
  const manifestPath = resolve(directory, 'source-manifest.json');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  manifest.sources[0].sha256 = '0'.repeat(64);
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  const resultsPath = resolve(directory, 'results.json');
  const results = JSON.parse(readFileSync(resultsPath, 'utf8'));
  results.run_context.source_hashes.cases = '0'.repeat(64);
  writeFileSync(resultsPath, `${JSON.stringify(results, null, 2)}\n`);
  const result = run(validator, directory);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /does not match cases\.json/);
});

test('the validator accepts a sealed suite whose manifest matches local files', () => {
  const directory = copyExample();
  configureSealedSuite(directory);
  const result = run(validator, directory);
  assert.equal(result.status, 0, result.stderr);
});

test('the validator requires a release decision and reason', () => {
  const directory = copyExample();
  const path = resolve(directory, 'results.json');
  const results = JSON.parse(readFileSync(path, 'utf8'));
  delete results.release_decision;
  delete results.release_reason;
  writeFileSync(path, `${JSON.stringify(results, null, 2)}\n`);
  const result = run(validator, directory);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /release_decision/);
  assert.match(result.stderr, /release_reason/);
});

test('the validator rejects an unsubstantiated model-judge calibration flag', () => {
  const directory = copyExample();
  const path = resolve(directory, 'cases.json');
  const cases = JSON.parse(readFileSync(path, 'utf8'));
  cases.cases[0].evaluator = { type: 'llm_judge', calibrated: true };
  writeFileSync(path, `${JSON.stringify(cases, null, 2)}\n`);
  const result = run(validator, directory);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /evaluator\.calibration/);
});

test('the privacy scanner detects supported personal-data patterns', () => {
  const directory = mkdtempSync(resolve(tmpdir(), 'agent-evals-playbook-privacy-'));
  writeFileSync(resolve(directory, 'leak.txt'), `Contact test.person${'@'}example.com`);
  const result = run(privacyScanner, directory);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /email address/);
});

test('the public documentation includes a runnable example guide', () => {
  const guide = readFileSync(resolve(example, 'README.md'), 'utf8');
  const main = readFileSync(resolve(root, 'README.md'), 'utf8');
  assert.match(guide, /Five of six cases pass/i);
  assert.match(guide, /eval\.html/i);
  assert.match(guide, /intentional/i);
  assert.doesNotMatch(main, /<repository-url>/i);
});
