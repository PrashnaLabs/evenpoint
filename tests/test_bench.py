import csv
import json
from datetime import datetime

from evenpoint import db, llm
from evenpoint.bench import graders, runner, tasks


def _setup(tmp_path):
    con = db.connect(tmp_path)
    run = db.new_run(con, "", {}, "test")
    groups = ["Billing", "Shipping", "Account"]
    db.insert(con, "events", [
        dict(run_id=run, case_id=str(i), activity="created", ts=datetime(2026, 1, 1 + i % 28), actor=None,
             source="csv", payload=json.dumps({"text": f"question {i}", "group": groups[i % 3], "reply": f"answer {i}"}))
        for i in range(30)
    ])
    return con, run


def test_classify_flow(tmp_path, monkeypatch):
    con, run = _setup(tmp_path)
    cand = dict(activity="assigned", task_type="classify", input_field="text", expected_field="group")
    ts = tasks.build(con, run, cand, n=10, few_shot=3, seed=1)
    assert len(ts) == 10
    assert "Allowed values: " in ts[0]["prompt"] and "Examples:" in ts[0]["prompt"]
    shot_cases = set(range(30)) - {int(t["case_id"]) for t in ts}
    assert len(shot_cases) == 20  # few-shot examples never overlap test cases (3 used, 17 unused)
    assert ts == tasks.build(con, run, cand, n=10, few_shot=3, seed=1)  # deterministic

    # Model answers "billing." for everything: right on the Billing cases only.
    monkeypatch.setattr(llm, "complete", lambda m, p, mt=None: llm.Reply("billing.", 10, 2, 0.001, 5))
    calls, failed, _ = runner.run(con, run, ["m1"], workers=2)
    assert (calls, failed) == (10, 0)
    assert runner.run(con, run, ["m1"], workers=2)[0] == 0  # resumes: nothing left to do

    graders.grade_all(con, run, "judge", workers=2)
    passed = dict(con.execute("SELECT task_id, passed FROM grades").fetchall())
    expected = {t["task_id"]: t["expected"] == "Billing" for t in ts}
    assert passed == expected

    # Human review overrides: export, mark everything as pass, import.
    out = tmp_path / "review.csv"
    assert graders.export_review(con, run, per_model=4, path=out) == 4
    rows = list(csv.DictReader(open(out)))
    for r in rows:
        r["pass"] = "yes"
    with open(out, "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=rows[0].keys())
        w.writeheader()
        w.writerows(rows)
    assert graders.import_review(con, run, out) == 4
    assert graders.import_review(con, run, out) == 4  # re-import replaces, doesn't duplicate
    assert con.execute("SELECT count(*) FROM grades WHERE grader = 'human'").fetchone()[0] == 4


def test_draft_judge(tmp_path, monkeypatch):
    con, run = _setup(tmp_path)
    cand = dict(activity="reply", task_type="draft", input_field="text", expected_field="reply")
    tasks.build(con, run, cand, n=5, few_shot=0, seed=1)

    def fake(model, prompt, max_tokens=None):
        if model == "judge":
            return llm.Reply('Here you go: {"pass": true, "score": 4, "note": "fine"}')
        return llm.Reply("draft", error="RateLimitError" if "question 1\n" in prompt else None)

    monkeypatch.setattr(llm, "complete", fake)
    runner.run(con, run, ["m1"], workers=1)
    graders.grade_all(con, run, "judge", workers=1)
    rows = con.execute("SELECT grader, passed, note FROM grades").fetchall()
    assert all(g == "llm_judge" for g, _, _ in rows)
    assert sum(p for _, p, _ in rows) >= 4
    assert con.execute("SELECT count(*) FROM runs WHERE kind = 'judge'").fetchone()[0] >= 4


def test_exact_normalization():
    assert graders.exact("Billing", ' "billing." ')
    assert not graders.exact("Billing", "Shipping")
