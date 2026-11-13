from types import SimpleNamespace

from evenpoint import db, roi
from evenpoint.config import BenchConfig, ReviewMinutes


def test_net_hours():
    # 600 tasks/month, 6 min -> 1 min review, 90% right, 10 min to fix a failure
    assert roi.net_hours(600, 6, 1, 0.9, 10) == 600 * 5 / 60 - 600 * 0.1 * 10 / 60  # 50 - 10 = 40


def test_bootstrap_range():
    lo, hi = roi.bootstrap([1] * 40 + [0] * 10, seed=1)
    assert lo < 0.8 < hi
    assert roi.bootstrap([1] * 20) == (1.0, 1.0)


def test_compute_verdicts(tmp_path):
    con = db.connect(tmp_path)
    run = db.new_run(con, "", {}, "test")
    db.insert(con, "steps", [dict(run_id=run, activity="tag", volume_per_month=600, median_minutes=6,
                                  minutes_source="config", handoff_rate=0, rework_rate=0, baseline_hours_month=60)])
    db.insert(con, "candidates", [dict(run_id=run, activity="tag", risk=2)])
    tasks, runs, grades = [], [], []
    for model, n_pass in (("good", 48), ("bad", 10)):
        for i in range(50):
            tid = f"tag:{i}"
            if model == "good":
                tasks.append(dict(run_id=run, task_id=tid, activity="tag"))
            runs.append(dict(run_id=run, kind="task", task_id=tid, model=model, cost_usd=0.001, latency_ms=100,
                             error=None))
            grades.append(dict(run_id=run, task_id=tid, model=model, grader="exact", passed=i < n_pass))
    # A human overrides one automatic fail of the good model.
    grades.append(dict(run_id=run, task_id="tag:49", model="good", grader="human", passed=True))
    for t, rows in (("tasks", tasks), ("runs", runs), ("grades", grades)):
        db.insert(con, t, rows)

    cfg = SimpleNamespace(bench=BenchConfig(seed=1), review_minutes=ReviewMinutes(auto=0, draft_review=1.5),
                          failure_minutes=10, hourly_rate=35, setup_cost_usd=1000)
    rows = {(r["model"], r["mode"]): r for r in roi.compute(con, run, cfg)}

    good = rows[("good", "auto")]
    assert good["accuracy"] == 49 / 50
    assert good["verdict"] == "automate"
    assert good["net_hours_low"] <= good["net_hours_month"] <= good["net_hours_high"]
    assert abs(good["ai_cost_month"] - 600 * 0.001) < 1e-9
    assert rows[("good", "draft_review")]["verdict"] == "review"
    assert rows[("bad", "auto")]["verdict"] == "dont_automate"
    assert rows[("bad", "auto")]["payback_months"] is None
