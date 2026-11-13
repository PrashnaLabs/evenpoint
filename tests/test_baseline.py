from datetime import datetime, timedelta
from types import SimpleNamespace

from evenpoint import baseline, db
from evenpoint.config import StepOverride


def test_baseline_steps_and_edges(tmp_path):
    con = db.connect(tmp_path)
    run = db.new_run(con, "", {}, "test")
    t0 = datetime(2026, 1, 1)
    rows = []
    # 60 cases over 60 days: created -> reply (30 min later, other actor) -> reply again on half (rework)
    for i in range(60):
        start = t0 + timedelta(days=i)
        evs = [("created", start, "cust"), ("reply", start + timedelta(minutes=30), "agent")]
        if i % 2:
            evs.append(("reply", start + timedelta(minutes=50), "agent"))
        rows += [dict(run_id=run, case_id=str(i), activity=a, ts=ts, actor=who, source="csv", payload="{}")
                 for a, ts, who in evs]
    db.insert(con, "events", rows)

    cfg = SimpleNamespace(steps={"created": StepOverride(minutes=2)})
    steps = {s["activity"]: s for s in baseline.compute(con, run, cfg)}

    months = (59 + 50 / 1440) / 30.44  # first event to last event (case 59 has a 50-min rework reply)
    assert abs(steps["created"]["volume_per_month"] - 60 / months) < 1e-6
    assert steps["created"]["minutes_source"] == "config"
    assert steps["created"]["baseline_hours_month"] == steps["created"]["volume_per_month"] * 2 / 60
    assert steps["reply"]["median_minutes"] == 30
    assert steps["reply"]["rework_rate"] == 0.5
    assert abs(steps["reply"]["handoff_rate"] - 60 / 90) < 1e-9  # 60 handoffs from cust, 30 agent->agent

    edges = {(s, t): n for _, s, t, n in con.execute("SELECT * FROM edges").fetchall()}
    assert edges == {("(start)", "created"): 60, ("created", "reply"): 60, ("reply", "reply"): 30}
