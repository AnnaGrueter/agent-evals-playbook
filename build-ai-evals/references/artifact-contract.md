# Artifact contract

## Contents

1. Evaluation contract and source manifest
2. Failure modes
3. Cases
4. Results
5. Evaluator selection
6. Model-judge calibration
7. Release rules

## 1. Evaluation contract and source manifest

`cases.json` must contain a top-level `contract` object with:

- `version`: stable version for the active rubric;
- `approved_by`: person or authority that settled the rubric;
- `verdict_policy`: `exact`, `within_one_step`, or `custom`;
- `component_variation`: whether sub-judgments such as icons may vary;
- `blocking_conditions`: non-empty list of failures that override tolerance;
- `source_precedence`: ordered list describing which source wins on conflict.

`results.json` must contain a `run_context` object with:

- `status`: `sealed`, `unsealed`, or `example`;
- `model` and `model_settings`;
- `instructions_hash`;
- `evaluator_version`;
- `contract_version`, matching `cases.json`;
- `source_hashes`, mapping each source name to a hash or immutable version.

Use `unavailable` only for sanitized examples. A real baseline with an unavailable required value is `unsealed` and cannot support a release claim. Amendments must create a new contract version. Do not silently reinterpret results produced under an older contract.

A `sealed` run also requires `source-manifest.json`:

```json
{
  "version": "1",
  "contract_version": "contract-v1",
  "instructions": {"path": "instructions.md", "sha256": "<sha256>"},
  "sources": [
    {"name": "cases", "path": "cases.json", "sha256": "<sha256>"}
  ]
}
```

Each manifest entry must contain either a suite-relative `path` plus its SHA-256 hash, or an `immutable_version` for a source that cannot be stored locally. The validator recomputes local hashes, compares every manifest value with `results.json.run_context`, rejects paths outside the suite, and requires the manifest contract version to match the active contract.

## 2. Failure modes

`failure-modes.json` must be an object with a `failure_modes` array. Each item requires:

- `id`
- `name`
- `description`
- `source`: `observed`, `observed-derived`, or `synthetic`
- `impact`: `critical`, `high`, `medium`, or `low`
- `expected_behavior`
- `release_policy`: `block`, `review`, or `diagnostic`

Optional fields include `frequency`, `trace_refs`, and `notes`.

## 3. Cases

`cases.json` must be an object with a `cases` array. Each item requires:

- `id`
- `feature`
- `failure_mode_id`
- `provenance`: `observed`, `observed-derived`, or `synthetic`
- `input`
- `expected`
- `pass_criteria`
- `evaluator.type`: `deterministic`, `classifier`, `llm_judge`, or `human`
- `notes`
- `set`: `development`, `holdout`, or `regression`

Observed and observed-derived cases require `trace_ref`. Synthetic cases require `synthetic_dimensions`.

A holdout becomes regression after its output or expected answer is inspected for tuning. Expected output may be exact or tolerant, but `pass_criteria` must state the tolerance and independent blocking conditions plainly.

## 4. Results

`results.json` must contain:

- `suite`
- `run_id`
- `run_at`
- `cases[]`, each with `case_id`, `status`, and `failure_mode_id`
- `summary`, including counts for passed, failed, errored, and total

Allowed statuses are `pass`, `fail`, `error`, and `not_run`.

`report.json` supplies human-readable metadata for `eval.html`: product name, tagline, evaluation contract, trace count, limitations, evaluator summary, and judge-calibration status.

Each result may include `observed`, containing the normalized output or concise observed judgment used for grading. The report must label expected behavior and observed result separately.

## 5. Evaluator selection

Use deterministic assertions for schemas, enums, required or forbidden fields, tool calls, IDs, counts, ordering, approval state, and exact grounded facts.

Use a classifier for a stable narrow distinction when deterministic rules are inadequate and labeled data supports validation.

Use a model judge only for nuanced semantic criteria that cannot be reduced to reliable code. Use human review for unresolved ambiguity or high-consequence judgments.

## 6. Model-judge calibration

An `llm_judge` evaluator requires:

- a binary criterion;
- `calibrated: true`;
- a `calibration` object with `human_labeled: true`;
- positive `train_count`, `development_count`, and `test_count` values;
- few-shot examples drawn only from the train set;
- judge tuning performed only on the development set;
- numeric `true_positive_rate` and `true_negative_rate` values between 0 and 1 from the untouched test set;
- non-empty `judge_model`, `judge_prompt_version`, and `escalation_rule` values.

Do not approve a judge based only on aggregate accuracy.

## 7. Release rules

Define a release decision for every failure mode. A suite-level pass rate can be displayed, but it must not override a blocking failure. Report sample sizes beside rates.

Derive the suite decision from result statuses and failure-mode policies: any failed, errored, or unrun `block` case yields `block`; otherwise any unsuccessful `review` case yields `review`; otherwise the decision is `pass`. Never accept a self-reported decision without reconciling it against the cases.

Do not combine tolerant ordinal scoring with grounding or safety checks. For example, a verdict may pass within one step while the same case fails because it invented evidence or omitted a required constraint.
