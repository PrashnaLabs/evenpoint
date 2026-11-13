# Evenpoint

Exports in, ROI out. Evenpoint reads the exports your business already has (Zendesk, Jira, any CSV, email), rebuilds how work flows, tests real AI models on samples of that work, and tells you what is worth automating, with which model, and what it saves.

Local-first, open source, bring your own API keys.

## Quick start

```bash
uv sync
cp .env.example .env                                          # add keys for the providers you list in the config

uv run evenpoint init exports/tickets.csv --adapter zendesk   # writes evenpoint.yaml; check the mapping
uv run evenpoint run                                         # all stages, writes output/report.html
```

Try it on the bundled synthetic workflow:

```bash
uv run evenpoint -c bizbench/support-triage/evenpoint.yaml run   # report in bizbench/support-triage/output/
```

Other commands:

```bash
uv run evenpoint rerun --models ollama/llama3.2   # test saved cases on another model
uv run evenpoint review export                   # human spot-check: fill the 'pass' column in output/review.csv...
uv run evenpoint review import                   # ...and the report uses your grades
uv run evenpoint run --from score                 # redo one stage onward
```

API keys are read from `.env` next to `evenpoint.yaml` (or in the current folder); variables already set in your shell take priority. Reports and review CSVs go to `output/` next to `evenpoint.yaml` (`output_dir` in the config).

Tests: `uv run pytest` (no network; the model is faked).

See [docs/overview.md](docs/overview.md), [docs/architecture.md](docs/architecture.md) and [docs/class-diagram.md](docs/class-diagram.md).

Status: early v0.
