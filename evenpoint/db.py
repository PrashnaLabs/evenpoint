"""DuckDB project store. Every stage reads and writes tables in one file."""

import json
from datetime import datetime
from pathlib import Path

import duckdb

SCHEMA = """
CREATE TABLE IF NOT EXISTS run_meta(
  run_id TEXT PRIMARY KEY, started_at TIMESTAMP, config_yaml TEXT,
  pricing_snapshot JSON, evenpoint_version TEXT);
CREATE TABLE IF NOT EXISTS events(
  run_id TEXT, case_id TEXT, activity TEXT, ts TIMESTAMP, actor TEXT, source TEXT, payload JSON);
CREATE TABLE IF NOT EXISTS steps(
  run_id TEXT, activity TEXT, volume_per_month DOUBLE, median_minutes DOUBLE, minutes_source TEXT,
  handoff_rate DOUBLE, rework_rate DOUBLE, baseline_hours_month DOUBLE);
CREATE TABLE IF NOT EXISTS edges(
  run_id TEXT, source_activity TEXT, target_activity TEXT, n BIGINT);
CREATE TABLE IF NOT EXISTS candidates(
  run_id TEXT, activity TEXT, repetitive INT, structured INT, risk INT, task_type TEXT,
  input_field TEXT, expected_field TEXT, fit_score DOUBLE, rank INT, testable BOOLEAN, reason TEXT);
CREATE TABLE IF NOT EXISTS tasks(
  run_id TEXT, task_id TEXT, activity TEXT, case_id TEXT, task_type TEXT,
  input TEXT, expected TEXT, prompt TEXT);
CREATE TABLE IF NOT EXISTS runs(
  run_id TEXT, kind TEXT, task_id TEXT, model TEXT, prompt TEXT, output TEXT,
  input_tokens INT, output_tokens INT, cost_usd DOUBLE, latency_ms INT, error TEXT, created_at TIMESTAMP);
CREATE TABLE IF NOT EXISTS grades(
  run_id TEXT, task_id TEXT, model TEXT, grader TEXT, passed BOOLEAN, score DOUBLE, note TEXT);
CREATE TABLE IF NOT EXISTS roi(
  run_id TEXT, activity TEXT, model TEXT, mode TEXT, accuracy DOUBLE,
  net_hours_month DOUBLE, net_hours_low DOUBLE, net_hours_high DOUBLE,
  net_value_month DOUBLE, net_value_low DOUBLE, ai_cost_month DOUBLE, payback_months DOUBLE,
  verdict TEXT, reason TEXT);
"""

STAGES = ["ingest", "baseline", "score", "bench", "grade", "roi", "report"]

# What each stage owns, so a stage can be re-run without redoing earlier ones.
STAGE_TABLES = {
    "ingest": [("events", "")],
    "baseline": [("steps", ""), ("edges", "")],
    "score": [("candidates", ""), ("runs", "AND kind = 'label'")],
    "bench": [("tasks", ""), ("runs", "AND kind = 'task'")],
    "grade": [("grades", "AND grader <> 'human'"), ("runs", "AND kind = 'judge'")],
    "roi": [("roi", "")],
}


def connect(project_dir: Path) -> duckdb.DuckDBPyConnection:
    project_dir.mkdir(parents=True, exist_ok=True)
    con = duckdb.connect(str(project_dir / "project.duckdb"))
    con.execute(SCHEMA)
    return con


def new_run(con, config_yaml: str, pricing: dict, version: str) -> str:
    run_id = datetime.now().strftime("%Y%m%d-%H%M%S")
    con.execute(
        "INSERT INTO run_meta VALUES (?, ?, ?, ?, ?)",
        [run_id, datetime.now(), config_yaml, json.dumps(pricing), version],
    )
    return run_id


def latest_run(con) -> str:
    row = con.execute("SELECT run_id FROM run_meta ORDER BY started_at DESC LIMIT 1").fetchone()
    if not row:
        raise SystemExit("No runs yet. Run: evenpoint run")
    return row[0]


def clear_from(con, run_id: str, stage: str) -> None:
    for s in STAGES[STAGES.index(stage):]:
        for table, extra in STAGE_TABLES.get(s, []):
            con.execute(f"DELETE FROM {table} WHERE run_id = ? {extra}", [run_id])


def insert(con, table: str, rows: list[dict]) -> None:
    # ponytail: executemany is fine for SMB-sized exports; switch to COPY from a temp file past ~1M rows.
    if not rows:
        return
    cols = list(rows[0])
    con.executemany(
        f"INSERT INTO {table} ({', '.join(cols)}) VALUES ({', '.join('?' * len(cols))})",
        [[r[c] for c in cols] for r in rows],
    )


def case_payloads(con, run_id: str) -> dict[str, dict]:
    """Merge every event's payload into one dict per case, later events winning."""
    cases: dict[str, dict] = {}
    rows = con.execute(
        "SELECT case_id, payload FROM events WHERE run_id = ? AND payload <> '{}' ORDER BY case_id, ts",
        [run_id],
    ).fetchall()
    for case_id, payload in rows:
        cases.setdefault(case_id, {}).update(json.loads(payload))
    return cases
