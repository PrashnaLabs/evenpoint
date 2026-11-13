# Evenpoint — Overview

**Exports in, ROI out — measured on your own data.**

Evenpoint is an open-source tool that tells a small or mid-sized business which of its workflows are worth handing to AI, which model to use, and how much time and money that will actually save. It runs locally on the data exports a business already has (support tickets, issue trackers, CRM, email, spreadsheets), and it measures instead of guessing: it rebuilds how work really flows, then tests real AI models on real samples of that work.

_Status: v0 implemented. See the [README](../README.md) to run it._

## The problem

Businesses asking "should we use AI for this?" today have three options, none of them good for an SMB:

- **Free ROI calculators** run on the user's own guesses about volume, time and accuracy.
- **Data-driven tools** (task mining, process mining, AI ROI platforms) are closed, priced for enterprises, and often require recording employees' desktops.
- **Consultants** run interviews and produce a slide deck, not a measurement.

Nobody offers an open-source tool that works from your own data and backs its numbers with model tests.

## Who it's for

SMB and mid-market operators, ops leads, and consultants who want a defensible answer to "what should we automate, with which model, and what's it worth?" before spending money on it.

## How it works

```
Exports ──► Event log ──► Baseline ──► AI-fit scoring ──► Benchmark ──► ROI ──► Report
```

### 1. Ingest
- Reads exports: Zendesk / Jira CSV, any other CSV (CRM, spreadsheets saved as CSV), email (mbox).
- Adapters per source, with **PII redaction**. Runs locally; no desktop agent.

### 2. Normalize
- **Event-log builder** turns rows into a standard event log: case · activity · time · actor.
- Stored in **DuckDB**.

### 3. Baseline (deterministic, no AI)
- Process mining in DuckDB SQL: process map, time per step, handoffs, rework.
- **Baseline cost** per step = volume × minutes per step.

### 4. AI-fit scoring
- **LLM step labeler** scores each step against a rubric: is it repetitive, is it structured, how risky is it.
- Produces **ranked automation candidates, with a reason for each**.

### 5. Benchmark on your own data
- **Task builder** turns sampled real records into test cases.
- **Model runner** runs them against OpenAI, Anthropic, Gemini and local models via Ollama.
- **Graders**: exact match, LLM judge, and human spot-checks.
- **Per model** results: accuracy, cost per *successful* task, latency, and the human review minutes needed.

### 6. ROI engine
- **Net hours saved** = volume × (baseline time − review time) − failure cost.
- Also reports AI cost per month, payback period, and a **don't-automate list** (steps where AI loses money or is too risky).

### 7. Outputs
- ROI report (HTML / PDF).
- CLI: `evenpoint init export.csv` then `evenpoint run`
- Web demo on sample data, no sign-up (planned).

## Shared foundation

- **Model pricing catalog**, versioned, so cost numbers are reproducible.
- **Trace store** holding every prompt, output and grade, so every number can be audited.
- **YAML config** for workflows, hourly rates and models.
- **bizbench**: a public dataset of common SMB workflows, for demos and comparing models (1 of a planned 15–20 so far: support triage).
- **Privacy**: local-first, bring your own API keys, PII redaction before anything reaches a model.

## What makes it different

| | Uses your data | Tests models | Open source | Built for SMB |
|---|---|---|---|---|
| ROI calculators | No (guesses) | No | Some | Yes |
| Task / process mining | Yes | No | No | No |
| AI ROI platforms | AI usage logs | No | No | No |
| Model benchmarks | No (generic tasks) | Yes | Partly | No |
| **Evenpoint** | **Yes (exports)** | **Yes** | **Yes** | **Yes** |

See [competitor-research.md](competitor-research.md) for the full landscape and the feature roadmap.
