---
name: run-ai-evals
description: Execute an existing frozen or versioned AI eval suite, capture outputs, apply its approved grading contract, regenerate results and the HTML report, and report release status without changing cases or expectations. Use when a user asks to run, rerun, baseline, regression-test, or score an agent whose eval suite already exists. Do not use to design a new suite or revise its rubric; use build-ai-evals for that.
---

# Run AI evals

Execute the active suite exactly as defined. Preserve the distinction between running an evaluation and changing what the evaluation means.

## Boundaries

- Do not change the contract, failure modes, cases, expected answers, tolerances, blocking conditions, or source precedence during a run.
- Do not fix the target agent, prompt, or application during the run.
- Do not reinterpret a failed case to improve the score.
- If the contract is missing, contradictory, stale, or incompatible with current evidence, stop. Report the conflict and use `build-ai-evals` to revise and version the suite before running it.
- Treat inspected holdouts as regression cases. Never describe reused cases as unseen evidence.

## 1. Locate and verify the suite

Require the suite's machine-readable artifacts, normally:

- `failure-modes.json`
- `cases.json`
- `results.json` or an empty results scaffold
- `report.json`
- `run.mjs` or documented execution procedure
- `source-manifest.json` for a real baseline or release run

Read the active contract version and confirm its approved authority, tolerance policy, component-variation policy, blocking conditions, and source precedence.

Verify source hashes or immutable versions before execution. Confirm the exact model, model settings, instruction or prompt version, evaluator version, and evidence-source versions. If a required value is missing or mismatched, mark the run `unsealed`. An unsealed run may diagnose regressions but cannot certify a release.

## 2. Freeze the execution plan

List the cases, attempts per case, model, settings, environment, and runner command or manual procedure. Hold these constant across comparable attempts.

For UI-hosted agents:

- use a fresh chat or session for every attempt unless the case explicitly tests conversation state;
- paste only the case input specified by the suite;
- record the model shown by the UI;
- capture only the model response as graded output;
- keep capture metadata outside the response boundary.

Do not expose API keys or secrets in prompts, logs, results, or reports.

## 3. Execute

Run the suite's own runner when available. Preserve raw outputs before normalization. If execution requires manual UI interaction, follow the frozen response plan and save every attempt under stable IDs.

Do not run the same suite simultaneously through two different execution paths unless the contract explicitly compares those paths.

If a case errors, preserve the error and retry only when the contract permits it. Record both the original error and the accepted retry; never silently replace a failed attempt.

## 4. Grade

Apply deterministic checks first. Apply human or calibrated model review only where the case specifies it.

For tolerant ordinal criteria, use the contract's declared distance. Grade factual grounding, required-item coverage, attribution, approval boundaries, and other blocking conditions independently. Component variation must not excuse an unsupported claim or omission when the contract defines either as blocking.

If a reviewer disagrees with the contract, record the disagreement without changing the grade. Contract changes belong to a new version and a separate run or explicitly authorized retrospective regrade.

## 5. Produce results

Write results with:

- suite, run ID, and timestamp;
- sealed, unsealed, or example status;
- model and settings;
- instruction, evaluator, contract, and source versions;
- per-attempt observed output and failed checks;
- per-case status;
- release decision and reason.

Regenerate `eval.html` from the machine-readable artifacts. The report must label expected behavior and observed results separately. Reconcile every displayed count with `results.json`.

## 6. Verify and return

- Run the suite validator.
- Confirm no evaluator metadata was graded as model output.
- Confirm the runner did not modify contract or case files.
- Check the report at desktop and responsive widths when its renderer changed.
- Run the privacy scan before sharing artifacts.

Return the report path, release decision, genuine failures, execution limitations, and whether the run is sealed. Do not change the target agent unless the user separately asks for fixes.
