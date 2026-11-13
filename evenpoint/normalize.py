"""Stages 1-2: read every source, redact, write the event log, summarize data quality."""

import json

from . import adapters, db
from .redact import redact_events


def ingest(con, run_id: str, cfg) -> int:
    total = 0
    for src in cfg.sources:
        events = redact_events(adapters.read(src.adapter, src.path, src.mapping), salt=cfg.project)
        db.insert(con, "events", [
            {
                "run_id": run_id,
                "case_id": e["case_id"],
                "activity": e["activity"],
                "ts": e["ts"],
                "actor": e["actor"],
                "source": src.adapter,
                "payload": json.dumps(e["payload"]),
            }
            for e in events
            if e["case_id"]
        ])
        total += len(events)
    return total


def quality_summary(con, run_id: str) -> dict:
    row = con.execute(
        """
        WITH per_case AS (
          SELECT case_id, count(*) AS n, max((payload <> '{}')::INT) AS has_text
          FROM events WHERE run_id = ? GROUP BY case_id)
        SELECT
          (SELECT count(*) FROM events WHERE run_id = ?) AS events,
          count(*) AS cases,
          coalesce(sum((n = 1)::INT), 0) AS single_event_cases,
          coalesce(sum(1 - has_text), 0) AS cases_without_text,
          (SELECT min(ts) FROM events WHERE run_id = ?) AS first_ts,
          (SELECT max(ts) FROM events WHERE run_id = ?) AS last_ts,
          (SELECT count(DISTINCT activity) FROM events WHERE run_id = ?) AS activities
        FROM per_case
        """,
        [run_id] * 5,
    ).fetchone()
    keys = ["events", "cases", "single_event_cases", "cases_without_text", "first_ts", "last_ts", "activities"]
    q = dict(zip(keys, row))
    q["warnings"] = []
    if q["cases"] and q["single_event_cases"] / q["cases"] > 0.5:
        q["warnings"].append("Over half the cases have a single event, so step times can't be measured. "
                             "Map more timestamp columns or set step minutes in evenpoint.yaml.")
    if q["cases"] and q["cases"] < 100:
        q["warnings"].append(f"Only {q['cases']} cases. Results will have wide ranges.")
    if q["cases"] and q["cases_without_text"] / q["cases"] > 0.5:
        q["warnings"].append("Over half the cases have no text fields, so few benchmark tasks can be built.")
    return q
