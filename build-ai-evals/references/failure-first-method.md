# Failure-first method

## Contents

1. Trace collection
2. Open coding
3. Failure taxonomy
4. Minimal reproduction
5. Sampling strategies
6. Synthetic data
7. Multi-step agents
8. Continuous improvement
9. Contract changes and contamination

## 1. Trace collection

Collect a diverse sample from real use when possible. Include successes, failures, common tasks, unusual inputs, different users, tool paths, and high-consequence actions. Around 100 traces is a useful discovery target, not a mandatory minimum and not the required number of final regression cases.

Record provenance and redact private information before material leaves its authorized environment.

## 2. Open coding

Review each trace without imposing a prewritten scorecard. Stop at the first meaningful upstream failure and write a short note describing what happened in application language.

Examples:

- `treated the user's outgoing message as recipient engagement`
- `logged an application before confirmation`
- `answered from generic career knowledge instead of supplied pipeline data`

Continue sampling until the taxonomy approaches theoretical saturation: new traces mostly map to existing categories and recoding no longer changes the categories materially.

## 3. Failure taxonomy

Group similar notes. Give each group a narrow name, examples, impact, and frequency evidence. Prioritize failures that are consequential, recurring, expensive to inspect manually, or likely to regress.

Do not create an automated eval merely because a behavior can be scored. Fix trivial one-off problems directly when regression risk is low.

## 4. Minimal reproduction

Reduce an observed trace to the smallest setup that still produces the failure. Preserve only the necessary state and turns before the error. Link the reproduction to the sanitized source trace without publishing the trace.

## 5. Sampling strategies

Use random sampling alongside targeted strategies:

- random traces to discover unknown problems;
- clusters to find repeated semantic patterns;
- outliers in latency, token use, turns, and tool calls;
- existing classifiers or evals to surface suspected failures;
- explicit user feedback.

## 6. Synthetic data

Use synthetic cases to bootstrap or extend coverage, not manufacture evidence. Define structured dimensions such as persona, scenario, ambiguity, missing fields, language, tool result, and adversarial instruction. Seed generation with sanitized real patterns where authorized. Increase complexity deliberately, generate more candidates than needed, filter them manually, and mark retained cases as synthetic or observed-derived. Avoid broad prompts such as “generate 50 test cases”; they tend to produce repetitive, generic inputs.

## 7. Multi-step agents

For multi-step workflows, record the states and transitions. Attribute each failure to the last successful transition and the state in which the first error appeared. A transition failure matrix can reveal hotspots hidden by aggregate success rates.

## 8. Continuous improvement

Use offline regression evals before changes ship. Sample production behavior asynchronously to discover new failures. Use synchronous guardrails only for high-impact errors that can be detected reliably with a low false-positive rate.

Every confirmed failure should either become a permanent regression case or carry a written reason for exclusion.

## 9. Contract changes and contamination

Keep development, holdout, and regression cases separate. Development cases may shape the system. Holdouts support a release decision only while unseen. After a holdout is inspected or used to change prompts, evidence, expected answers, or grading, move it to regression.

Version the grading contract independently from the cases. A contract change states what it supersedes, why it changed, and whether old results remain comparable. Regrade existing outputs only when the new contract explicitly permits retrospective grading; otherwise run a new baseline.

Expected answers are not permanent truth. When approved evidence changes, reconcile every affected case before running it. Reject a suite whose active cases reference superseded expectations.
