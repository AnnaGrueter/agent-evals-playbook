# Relationship Pipeline example

This fictionalized suite shows how to turn observed AI workflow failures into narrow regression tests without publishing private traces.

It is deliberately not a perfect demo. Five of six cases pass and one blocking case fails, so the report shows how a useful failure appears instead of presenting an artificial 100% score.

## Run the example

From the repository root:

```bash
node examples/relationship-pipeline/run.mjs
```

The command exits with status `1` because the blocking failure is intentional. That exit means the release check worked; it does not mean the runner crashed.

The run updates:

- `results.json`, the machine-readable case outcomes;
- `report.json`, the report metadata;
- `eval.html`, the standalone review report.

Open `eval.html` in a browser to inspect the summary, failure modes, expected behavior, and observed result for every case.

## Files

- `failure-modes.json` defines the application-specific failure taxonomy.
- `cases.json` contains the frozen grading contract and six development or regression cases.
- `sample-outputs.json` acts as the target system for this self-contained example.
- `report-config.json` contains the stable human-readable report description.
- `run.mjs` evaluates those outputs with deterministic checks.
- `results.json` is the source of truth for the latest run.
- `report.json` provides human-readable report context.
- `eval.html` is generated from the JSON artifacts.

## What to notice

- Every case links to one failure mode.
- Expected behavior and observed output are displayed separately.
- One blocking failure overrides the aggregate pass rate.
- The inputs are sanitized reproductions, labelled `observed-derived` rather than presented as raw production evidence.
- The run context is marked `example`; it is not release evidence for a real product.

To build a real suite, use `build-ai-evals`. After the contract and sources are frozen, use `run-ai-evals` to execute it without changing the rules.
