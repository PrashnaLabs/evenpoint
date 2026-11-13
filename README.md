# Evenpoint

Exports in, ROI out. Evenpoint reads the exports your business already has (Zendesk, Jira, CRM CSVs, email), rebuilds how work flows, tests real AI models on samples of that work, and tells you what is worth automating, with which model, and what it saves.

Local-first, open source, bring your own API keys.

```bash
uv sync
uv run evenpoint init exports/tickets.csv --adapter zendesk   # writes evenpoint.yaml
uv run evenpoint run                                         # all stages, writes report.html
```

See [docs/overview.md](docs/overview.md) and [docs/architecture.md](docs/architecture.md).

Status: early v0.
