# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Python package (CLI + local HTTP API, stdlib server) with a web UI built in **Astro** (user's choice), compiled to static files that the Python server serves. Runs locally only.

## Users

An operations lead at a small or mid-sized business (support lead, ops manager), analysing **their own team's** exports. Not a data scientist and not a developer; comfortable with spreadsheets and their helpdesk's export menu. They come back every few weeks or months (a new export, a new model release), with a handful of projects over time. Job: decide, with numbers they can defend to a manager, which steps of their team's work to hand to AI, with which model, and what it saves.

## Product Purpose

Evenpoint turns a helpdesk/ticket/email export into a measured answer to "what should we automate with AI?". It rebuilds how work flows from the export, scores each step for AI fit, tests real models on real past cases (graded against what the team actually did), and converts results into hours and money saved, with ranges and a don't-automate list. Success: the user leaves a run with a recommendation they trust and a report they can forward.

## Positioning

Measured on the user's own data, not guesses: every number comes from their export and from model tests graded against their team's real outputs, with a range, and every prompt/output/grade is auditable. Vendor-neutral (not selling an AI agent), open source, local-first.

## Operating Context

- Starts from a file the user exported: Zendesk/Jira CSV, any CSV, or an email mbox.
- Runs on the user's laptop at localhost; data stays local except redacted text sent to the configured model provider (OpenAI by default) with the user's own API key from `.env`.
- A run takes minutes and costs cents to a few dollars; the user confirms before spending above a set limit.
- Outputs: an interactive results view and a self-contained HTML report (printable to PDF) to share with a manager.
- Optional human spot-check: the user marks a sample of AI outputs pass/fail; those grades override automatic ones.

## Capabilities and Constraints

- Pipeline stages: ingest (with PII redaction) → baseline → AI-fit scoring → benchmark → grading → ROI → report. Stages can be re-run from any point; new models can be added to a finished run.
- Task types: classify, extract, draft. Modes: fully automatic, AI drafts + person approves.
- Assumptions the user controls: hourly rate, minutes per step, review minutes, fallout minutes for wrong outputs, setup cost, test cases per step, max spend.
- Local only, single user, no login. Must not expose the API to other sites or machines.
- Terminology: project, export, step, candidate, test case, model, verdict (automate / automate with review / don't automate).

## Brand Commitments

- App UI is modern and minimal (user-directed redesign, November 2026, using the ui-ux-pro-max design system: Minimalism & Swiss, light). Show only what helps the decision; merge information wherever possible; evidence sits one click away. Low friction and fast time-to-value outrank completeness on screen. Do not copy any vendor's brand assets or colors.

## Evidence on Hand

- Sample workflows: `bizbench/support-triage` (synthetic) and `bizbench/kaggle-support-tickets` (Kaggle dataset, prepared locally).
- No customers, testimonials or benchmarks to quote; do not invent any.

## Product Principles

1. Show the range, not just the number: uncertainty is part of every result.
2. Every number is traceable to data, an assumption the user set, or a logged model call.
3. Plain language for operators; no ML jargon without explanation.
4. Nothing costs money or leaves the machine without the user seeing it first.
5. "Don't automate" is a first-class, respectable answer.

## Accessibility & Inclusion

No product-specific requirement established; meet WCAG 2.2 AA as the default floor.
