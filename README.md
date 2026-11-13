# Evenpoint

**Exports in, ROI out.** Evenpoint tells an operations team which parts of its work are worth handing to AI, with which model, and what it would save, measured on the team's own data.

You give it an export you already have (Zendesk or Jira CSV, any CSV, or an email `.mbox`). Evenpoint rebuilds how the work flows, tests AI models on real past cases, grades every answer against what your team actually did, and turns the results into hours and money saved, with a range and a clear "don't automate" when that's the honest answer.

It runs on your computer. Your data stays local except for redacted text from a sample of cases, which is sent to the model provider you choose (OpenAI by default) with your own API key.

## What you get

- **A guided start:** drop a file (or pick sample data), confirm what Evenpoint detected, enter two numbers, run.
- **A clear answer:** estimated savings per month, the range they could fall in, and a verdict for each step: *Automate*, *Automate with review*, or *Don't automate*.
- **Evidence on demand:** how each model did, how the work flows today, your assumptions, and every prompt and answer kept for audit.
- **Check the AI's work:** pass or fail a sample of answers yourself; your grades replace the automatic ones.
- **A shareable report:** a three-page HTML report you can print to PDF and send to a manager.
- **A command line** for scripting and automation.

## Requirements

- Python 3.11 or newer and [uv](https://docs.astral.sh/uv/)
- Node.js 22.23 or newer and npm (to build the web interface)
- An OpenAI API key ([create one](https://platform.openai.com/api-keys)); other providers supported by LiteLLM also work

## Quick start

```bash
git clone git@github.com:PrashnaLabs/evenpoint.git
cd evenpoint

uv sync                                     # Python dependencies
(cd web && npm install && npm run build)    # build the web interface (once, and after UI changes)

cp .env.example .env                        # then put your OpenAI key in .env
uv run evenpoint ui                         # opens http://localhost:8765
```

The first screen walks you through your first analysis. No export handy? Pick **Mock support tickets** (240 synthetic tickets, a few cents to run) or **Real GitHub issues** (544 real issues from the uv project).

You can also paste your API key into the app instead of editing `.env`; it's saved to `projects/.env` on your machine.

Projects are stored in `./projects` (change with `--dir`). The server only listens on `localhost`.

## Using the command line

Every project is a folder with an `evenpoint.yaml`, so everything in the app also works from the terminal.

```bash
uv run evenpoint init exports/tickets.csv --adapter zendesk   # write evenpoint.yaml for an export
uv run evenpoint run                                          # run all stages, write output/report.html
uv run evenpoint run --from roi                               # redo a stage onward (roi is free: no model calls)
uv run evenpoint rerun --models openai/gpt-5.4                # test more models on the saved cases
uv run evenpoint review export                                # export AI answers to grade in output/review.csv
uv run evenpoint review import                                # import your grades and update results
uv run evenpoint report                                       # re-render the report
```

All commands take `-c path/to/evenpoint.yaml`. See `uv run evenpoint --help`.

Run the bundled examples directly:

```bash
uv run evenpoint -c bizbench/support-triage/evenpoint.yaml run
uv run evenpoint -c bizbench/github-issue-triage/evenpoint.yaml run
```

## How it works

1. **Ingest:** read the export and remove emails, phone numbers, card numbers, secret URLs and staff names.
2. **Baseline:** measure how often each step happens and how long it takes, from the export's timestamps (or minutes you enter).
3. **Score:** a model rates each step for how repetitive, structured and risky it is.
4. **Test:** models do real past cases; for example, picking the queue a person picked, or drafting the reply a person wrote.
5. **Grade:** exact match for labels, a stronger model as judge for written replies, and optional human review.
6. **ROI:** hours and money saved per month, after AI costs and checking time, with a range from the test sample.
7. **Report:** results in the app and as a shareable HTML report.

Before any model is called for testing, Evenpoint estimates the cost and asks you to confirm if it's above your limit (default $5).

More detail: [docs/overview.md](docs/overview.md) · [docs/architecture.md](docs/architecture.md) · [docs/class-diagram.md](docs/class-diagram.md).

## Privacy

- Exports, results and reports stay in your project folder.
- Only redacted text from the sampled test cases is sent to the model provider you configure. Choose a local model (for example `ollama/llama3.2`) to send nothing at all.
- Redaction is pattern-based and can miss things such as customer names in free text. Use a local model for sensitive data.
- Your API key is read from `.env` and never written to project files or results.

## Development

```bash
uv run pytest                     # tests (no network: models are faked)
uv run evenpoint ui --reload      # restarts on Python changes, rebuilds the UI on web/ changes, refreshes pages
```

Repository layout:

```
evenpoint/          Python package: pipeline stages, CLI, local API server, report
  adapters/         CSV (Zendesk, Jira, any) and mbox readers
  bench/            test cases, model runner, graders
  report/           HTML report template
web/                Astro source for the web interface (builds into evenpoint/web_dist/)
bizbench/           example workflows (synthetic and real data)
tests/              test suite
docs/               overview, architecture, class diagram, competitor research
```

Design notes for the interface live in [DESIGN.md](DESIGN.md) and [PRODUCT.md](PRODUCT.md).

## License

Apache License 2.0. See [LICENSE](LICENSE). Bundled third-party material (the report font and sample data) is listed in [NOTICE](NOTICE).
