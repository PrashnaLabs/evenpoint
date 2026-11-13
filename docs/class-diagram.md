# Evenpoint — Class Diagram

_Companion to [architecture.md](architecture.md). Evenpoint is mostly plain functions over DuckDB tables, so the "classes" here are dataclasses (config), records (table rows, passed around as dicts), enums, and modules shown as `<<module>>` with their public functions. Matches the v0 code._

Three views:

1. [Domain records](#1-domain-records): what each pipeline stage produces (the DuckDB tables).
2. [Configuration](#2-configuration): `evenpoint.yaml` as dataclasses (`evenpoint/config.py`).
3. [Modules](#3-modules): which code produces and consumes which records.

## 1. Domain records

```mermaid
classDiagram
  direction LR

  class RunMeta {
    +str run_id
    +datetime started_at
    +str config_yaml
    +dict pricing_snapshot
    +str evenpoint_version
  }

  class Event {
    +str run_id
    +str case_id
    +str activity
    +datetime ts
    +str actor
    +str source
    +dict payload
  }

  class Step {
    +str run_id
    +str activity
    +float volume_per_month
    +float median_minutes
    +MinutesSource minutes_source
    +float handoff_rate
    +float rework_rate
    +float baseline_hours_month
  }

  class Edge {
    +str run_id
    +str source_activity
    +str target_activity
    +int n
  }

  class Candidate {
    +str run_id
    +str activity
    +int repetitive
    +int structured
    +int risk
    +TaskType task_type
    +str input_field
    +str expected_field
    +float fit_score
    +int rank
    +bool testable
    +str reason
  }

  class Task {
    +str run_id
    +str task_id
    +str activity
    +str case_id
    +TaskType task_type
    +str input
    +str expected
    +str prompt
  }

  class ModelRun {
    +str run_id
    +RunKind kind
    +str task_id
    +str model
    +str prompt
    +str output
    +int input_tokens
    +int output_tokens
    +float cost_usd
    +int latency_ms
    +str error
    +datetime created_at
  }

  class Grade {
    +str run_id
    +str task_id
    +str model
    +GraderKind grader
    +bool passed
    +float score
    +str note
  }

  class ModelSummary {
    +str activity
    +str model
    +list~int~ passes
    +float accuracy
    +float cost_per_task
    +float cost_per_success
    +float latency_p50_ms
    +float latency_p95_ms
    +float error_rate
    +float judge_human_agreement
  }

  class RoiResult {
    +str run_id
    +str activity
    +str model
    +Mode mode
    +float accuracy
    +float net_hours_month
    +float net_hours_low
    +float net_hours_high
    +float net_value_month
    +float net_value_low
    +float ai_cost_month
    +float payback_months
    +Verdict verdict
    +str reason
  }

  class TaskType {
    <<enumeration>>
    classify
    extract
    draft
  }

  class Mode {
    <<enumeration>>
    auto
    draft_review
  }

  class Verdict {
    <<enumeration>>
    automate
    review
    dont_automate
  }

  class GraderKind {
    <<enumeration>>
    exact
    llm_judge
    human
  }

  class RunKind {
    <<enumeration>>
    label
    task
    judge
  }

  class MinutesSource {
    <<enumeration>>
    timestamps
    config
  }

  RunMeta "1" --> "*" Event : run_id
  Event "*" --> "1" Step : grouped by activity
  Event "*" --> "*" Edge : consecutive pairs
  Step "1" --> "0..1" Candidate : scored as
  Candidate "1" --> "*" Task : sampled into
  Event "1" --> "0..1" Task : case payload
  Task "1" --> "*" ModelRun : one per model
  ModelRun "1" --> "*" Grade : one per grader
  Grade "*" --> "1" ModelSummary : aggregated
  ModelSummary "1" --> "2" RoiResult : one per mode
  Step "1" --> "*" RoiResult : baseline

  Candidate ..> TaskType
  Task ..> TaskType
  Grade ..> GraderKind
  ModelRun ..> RunKind
  RoiResult ..> Mode
  RoiResult ..> Verdict
  Step ..> MinutesSource
```

`ModelSummary` is computed by `roi.summaries()` (SQL), not stored. Everything else is a DuckDB table. Labeler and judge calls are `ModelRun` rows too (`kind = label | judge`), so every model call is in the trace store.

## 2. Configuration

```mermaid
classDiagram
  direction LR

  class Config {
    +str project
    +list~SourceConfig~ sources
    +list~str~ models
    +str labeler_model
    +str judge_model
    +float hourly_rate
    +dict~str, StepOverride~ steps
    +BenchConfig bench
    +ReviewMinutes review_minutes
    +float failure_minutes
    +float setup_cost_usd
    +float min_volume_per_month
    +int max_candidates
    +str output_dir
    +Path root
    +str raw
    +load(path) Config$
    +project_dir() Path
    +output_path() Path
  }

  class SourceConfig {
    +str adapter
    +Path path
    +dict mapping
  }

  class StepOverride {
    +float minutes
    +str task_type
    +str input
    +str expected
  }

  class BenchConfig {
    +int tasks_per_candidate
    +int few_shot
    +float max_cost_usd
    +int seed
    +int workers
  }

  class ReviewMinutes {
    +float auto
    +float draft_review
    +for_mode(mode) float
  }

  Config *-- "1..*" SourceConfig
  Config *-- "*" StepOverride
  Config *-- "1" BenchConfig
  Config *-- "1" ReviewMinutes
```

API keys are not part of `Config`; LiteLLM reads them from environment variables.

## 3. Modules

```mermaid
classDiagram
  direction TB

  class cli {
    <<module>>
    +main(argv)
    +cmd_init(args)
    +cmd_run(args)
    +cmd_rerun(args)
    +cmd_review(args)
    +cmd_report(args)
    +run_stages(con, run_id, cfg, start, yes, out, models)
  }

  class db {
    <<module>>
    +STAGES
    +connect(project_dir) Connection
    +new_run(con, config_yaml, pricing, version) str
    +latest_run(con) str
    +clear_from(con, run_id, stage)
    +insert(con, table, rows)
    +case_payloads(con, run_id) dict
  }

  class adapters {
    <<module>>
    +DEFAULT_MAPPINGS
    +read(adapter, path, mapping) list~Event~
  }
  class tabular {
    <<module>>
    +read(path, mapping) list~Event~
    +parse_ts(value, fmt) datetime
  }
  class mbox {
    <<module>>
    +read(path, mapping) list~Event~
  }

  class redact {
    <<module>>
    +redact_text(text, names) str
    +pseudonymize(actor, salt) str
    +redact_events(events, salt) list~Event~
  }

  class normalize {
    <<module>>
    +ingest(con, run_id, cfg) int
    +quality_summary(con, run_id) dict
  }

  class baseline {
    <<module>>
    +compute(con, run_id, cfg) list~Step~
  }

  class llm {
    <<module>>
    +complete(model, prompt, max_tokens) Reply
    +estimate_cost(model, prompt, output_tokens) float
    +pricing_snapshot(models) dict
    +parse_json(text) dict
    +log_row(run_id, kind, task_id, model, prompt, reply) ModelRun
  }

  class score {
    <<module>>
    +label_steps(con, run_id, cfg) list~Candidate~
    +fit_score(hours, repetitive, structured, risk) float
  }

  class bench_tasks {
    <<module>>
    +build(con, run_id, candidate, n, few_shot, seed) list~Task~
    +estimate_cost(tasks, models, judge_model) float
  }

  class bench_runner {
    <<module>>
    +run(con, run_id, models, workers) tuple
  }

  class bench_graders {
    <<module>>
    +grade_all(con, run_id, judge_model, workers) int
    +exact(expected, output) bool
    +export_review(con, run_id, per_model, path, seed) int
    +import_review(con, run_id, path) int
  }

  class roi {
    <<module>>
    +summaries(con, run_id) list~ModelSummary~
    +compute(con, run_id, cfg) list~RoiResult~
    +bootstrap(passes, n, seed) tuple
    +net_hours(volume, baseline_min, review_min, accuracy, failure_min) float
  }

  class report {
    <<module>>
    +gather(con, run_id, cfg) dict
    +render(con, run_id, cfg, out) Path
  }

  class LiteLLM {
    <<external>>
    +completion()
    +completion_cost()
    +model_cost
  }
  class DuckDB {
    <<external>>
  }
  class Jinja2 {
    <<external>>
  }

  adapters <|.. tabular
  adapters <|.. mbox

  cli --> normalize
  cli --> baseline
  cli --> score
  cli --> bench_tasks
  cli --> bench_runner
  cli --> bench_graders
  cli --> roi
  cli --> report

  normalize --> adapters
  normalize --> redact : before write
  normalize --> db
  baseline --> db
  score --> llm
  score --> db
  bench_tasks --> llm : cost estimate
  bench_tasks --> db
  bench_runner --> llm
  bench_runner --> db : every call logged
  bench_graders --> llm : judge
  bench_graders --> db
  roi --> db
  report --> roi
  report --> normalize
  report --> Jinja2
  llm --> LiteLLM
  db --> DuckDB
```

`adapters <|.. tabular` means both readers return the same event shape; there is no base class, and the `zendesk` and `jira` adapters are default mappings for `tabular`. `bench_tasks`, `bench_runner` and `bench_graders` are `bench/tasks.py`, `bench/runner.py` and `bench/graders.py` (Mermaid doesn't allow dots in names). `llm` is the only module that talks to model providers; tests replace `llm.complete`.
