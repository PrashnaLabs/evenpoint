"""Stage 3: deterministic baseline from the event log (process map, step times, handoffs, rework).

Done in DuckDB SQL: a directly-follows graph and per-step stats are a few window functions.
"""

from . import db

EVENTS_WITH_PREV = """
  SELECT *,
    lag(ts)       OVER w AS prev_ts,
    lag(activity) OVER w AS prev_activity,
    lag(actor)    OVER w AS prev_actor
  FROM events WHERE run_id = $run
  WINDOW w AS (PARTITION BY case_id ORDER BY ts, activity)
"""


def compute(con, run_id: str, cfg) -> list[dict]:
    rows = con.execute(
        f"""
        WITH ev AS ({EVENTS_WITH_PREV}),
        span AS (
          SELECT greatest(date_diff('second', min(ts), max(ts)) / 86400.0, 1) / 30.44 AS months
          FROM events WHERE run_id = $run),
        rework AS (
          SELECT activity, avg((n > 1)::INT) AS rework_rate
          FROM (SELECT activity, case_id, count(*) AS n FROM ev GROUP BY ALL) GROUP BY activity)
        SELECT ev.activity,
          count(*) / any_value(span.months) AS volume_per_month,
          median(date_diff('second', prev_ts, ts) / 60.0) AS median_minutes,
          coalesce(avg(CASE WHEN prev_actor IS NOT NULL AND actor IS NOT NULL
                            THEN (actor <> prev_actor)::INT END), 0) AS handoff_rate,
          any_value(rework.rework_rate) AS rework_rate
        FROM ev JOIN rework USING (activity) CROSS JOIN span
        GROUP BY ev.activity
        ORDER BY volume_per_month DESC
        """,
        {"run": run_id},
    ).fetchall()

    steps = []
    for activity, volume, measured, handoff, rework in rows:
        override = cfg.steps.get(activity)
        if override and override.minutes is not None:
            minutes, source = override.minutes, "config"
        else:
            # Time since the previous event includes waiting time, so it overstates work time.
            minutes, source = measured or 0.0, "timestamps"
        steps.append({
            "run_id": run_id,
            "activity": activity,
            "volume_per_month": volume,
            "median_minutes": minutes,
            "minutes_source": source,
            "handoff_rate": handoff,
            "rework_rate": rework,
            "baseline_hours_month": volume * minutes / 60,
        })
    db.insert(con, "steps", steps)

    edges = con.execute(
        f"""
        WITH ev AS ({EVENTS_WITH_PREV})
        SELECT $run, coalesce(prev_activity, '(start)'), activity, count(*)
        FROM ev GROUP BY ALL ORDER BY 4 DESC
        """,
        {"run": run_id},
    ).fetchall()
    db.insert(con, "edges", [dict(zip(("run_id", "source_activity", "target_activity", "n"), e)) for e in edges])
    return steps
