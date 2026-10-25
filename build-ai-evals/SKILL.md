---
name: build-ai-evals
description: Build or improve failure-first eval suites for AI features, workflows, and specialized agents. Use when inspecting traces, identifying failure modes, creating regression cases, choosing deterministic or model-based evaluators, calibrating LLM judges, setting release thresholds, or producing an eval report and reusable test artifacts.
---

# Build AI evals

Create an evidence-grounded eval suite that helps a team decide what to fix and whether a change is safe to ship.

## Rules

- Inspect the target system and available traces before writing eval cases.
- Tie every eval to one observed or deliberately induced failure mode.
- Mark provenance as `observed`, `observed-derived`, or `synthetic`.
- Never present synthetic cases as production evidence.
- Prefer binary, application-specific outcomes over generic quality scores.
- Prefer deterministic evaluators whenever they can test the failure reliably.
- Never trust a model judge until it has been compared with human labels.
- Sanitize private data before creating shareable artifacts.
- Report failures and limitations; do not optimize the suite for an impressive pass rate.
- Build and validate the evaluation machinery, but do not execute the live target system. Use `run-ai-evals` for a baseline, regression, or release run.

## Workflow

### 1. Define the evaluation contract

State:

- the AI feature or agent's job;
- its users and consequential decisions;
- inputs, outputs, tools, and state changes;
- human approval boundaries;
- the decision the eval suite must support.

Freeze the contract before running cases. Record:

- a contract version and the authority who approved it;
- exact versus tolerant criteria, including any ordered-label distance allowed;
- which mismatches are diagnostic and which block a case;
- source precedence when expected answers, instructions, and evidence disagree;
- the rule for omissions, unsupported claims, and attribution changes.

Never infer strict equality from an expected answer when the approved contract allows variation. Never let a tolerant score excuse an unsupported claim, omitted required item, unsafe action, or other explicitly blocking failure.

If the product has multiple AI touchpoints, evaluate each separately before producing an aggregate view.

### 2. Inventory the implementation

Inspect every model call and record:

- system prompt and relevant prompt construction;
- model and parameters;
- input and output schemas;
- tool definitions and allowed actions;
- parsing, validation, retries, fallbacks, and guardrails;
- existing tests, fixtures, evals, and result snapshots.

Before a baseline or release run, save a run manifest containing the exact model identifier, model settings, instruction or prompt hash, evaluator version, case-contract version, and hashes or immutable versions for every evidence source. If any required source is unavailable, label the run `unsealed` and do not present it as release evidence.

Do not copy secrets or private records into eval artifacts.

### 3. Analyze traces before writing cases

Read [references/failure-first-method.md](references/failure-first-method.md). Sample diverse real traces when available. For each trace, annotate the first meaningful failure with a short, unstructured note. Group notes into failure modes and continue until additional traces stop producing material new categories.

Always include some random sampling when traces are available. Add targeted sampling through clusters, outliers, existing classifiers, and user feedback to find known or high-risk patterns.

When real traces are unavailable, say so. Use structured synthetic scenarios seeded by known workflows or manually observed behavior, and label the evidence limitation.

### 4. Create the failure taxonomy

For each failure mode, record:

- a stable ID and application-specific name;
- observed evidence or synthetic provenance;
- impact and frequency evidence;
- the expected behavior;
- the most suitable evaluator;
- whether it should block release, trigger review, or remain diagnostic.

Do not use categories such as `helpfulness`, `quality`, or `faithfulness` unless the application defines an observable binary failure for them.

### 5. Build minimal regression cases

Reproduce the failure with the least context needed. Each case must contain:

- a unique ID;
- feature or agent step;
- linked failure-mode ID;
- provenance and trace reference when applicable;
- exact input or setup;
- expected behavior;
- binary pass criteria;
- evaluator configuration;
- notes explaining why the case matters.

Use coverage labels such as golden path, edge, adversarial, and regression only as secondary metadata. They do not replace failure modes.

Assign every case to one set:

- `development`: may shape prompts, rubrics, and expected answers;
- `holdout`: unseen until the release decision;
- `regression`: previously exposed and used to catch recurrence.

Once a holdout is inspected, discussed, or used for tuning, relabel it as regression. Never describe a reused case as unseen evidence.

### 6. Select evaluators

Use this order:

1. deterministic assertion;
2. small classifier or guardrail;
3. model judge;
4. human review.

For a model judge, require human-labeled train, development, and untouched test examples. Draw few-shot examples from the train split, tune the judge on development, and report true-positive and true-negative rates separately on the untouched test split. Do not use a 1–5 scale by default. See [references/artifact-contract.md](references/artifact-contract.md).

### 7. Set thresholds and release rules

Set thresholds per failure mode based on consequence. Safety, privacy, unauthorized actions, and corrupted state may require zero tolerated failures. Lower-impact stylistic issues may remain diagnostic.

Explain the sample size and uncertainty. Do not imply that a small suite proves production reliability.

For ordinal outputs, encode the accepted distance explicitly, such as exact match or within one adjacent category. State separately whether component judgments such as row labels may vary. Keep factual grounding, required-item coverage, approval boundaries, and attribution as independent blocking checks when the contract requires them.

### 8. Create the suite

Create these files under `evals/`:

- `failure-modes.json`
- `cases.json`
- `results.json`
- `report.json`
- `source-manifest.json` for real baselines and release runs
- `run.mjs`
- `eval.html`

Use [assets/eval-template.html](assets/eval-template.html) as the report shell. Keep the JSON artifacts as the source of truth. The HTML must clearly distinguish observed evidence, observed-derived reproductions, and purely synthetic cases.

In the report, label pass criteria as expected behavior and show observed status and details separately. Never place expected wording where readers could mistake it for the model's observed output.

Run `node scripts/validate_eval_suite.mjs <path-to-evals>` from this skill directory, or execute the validator using its absolute path.
Generate the report with `node scripts/render_report.mjs <path-to-evals>`.

The builder may create the runner and test it with fixtures, dry-run validation, or mocked outputs. It must not call the live agent or model; hand the frozen suite to `run-ai-evals` for execution.

### 9. Verify

- Exercise the runner twice with fixtures, dry-run mode, or mocked outputs and confirm stable deterministic grading.
- Confirm every case references a defined failure mode.
- Confirm no placeholders, secrets, personal records, or raw production traces remain.
- Check the report on desktop and mobile, every navigation control, both themes, and the browser console.
- Reconcile the report numbers with `results.json`.
- Confirm the runner grades only model output, not capture headers or evaluator metadata.
- Confirm every amendment is reflected in the active contract and stale expectations are rejected or superseded.
- Confirm the model, settings, instructions, evidence versions, evaluator version, and contract version are present in the run manifest.
- State what was not tested.

Return the artifact paths, observed results, limitations, and the next evidence needed. Do not publish or change production systems without explicit approval.
