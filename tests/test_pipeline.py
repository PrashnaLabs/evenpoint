"""End to end on the bizbench support-triage workflow, with a fake model instead of real API calls."""

import csv
import os
import re
import shutil
from pathlib import Path

import duckdb

from evenpoint import cli, llm

BIZBENCH = Path(__file__).parent.parent / "bizbench" / "support-triage"
KEYWORDS = {"charged": "Billing", "invoice": "Billing", "order #": "Shipping", "return": "Returns",
            "log in": "Account", "account": "Account", "wash": "Product"}


def fake_complete(model, prompt, max_tokens=None):
    if prompt.startswith("You are assessing"):
        risk = 5 if "Step: created" in prompt else 2
        return llm.Reply('{"repetitive": 4, "structured": 4, "risk": %d, "task_type": "classify", '
                         '"input_field": "text", "expected_field": "group", "reason": "Routine routing."}' % risk)
    if prompt.startswith("You are checking"):
        return llm.Reply('{"pass": true, "score": 4, "note": "ok"}', 100, 20, 0.002, 300)
    case_text = prompt.rsplit("text: ", 1)[-1].lower()
    if "Allowed values" in prompt:
        label = next((v for k, v in KEYWORDS.items() if k in case_text), "Product")
        return llm.Reply(label, 300, 2, 0.0003, 400)
    return llm.Reply("Thanks, we're on it.", 300, 30, 0.0005, 900)


def test_bizbench_end_to_end(tmp_path, monkeypatch):
    for f in ("evenpoint.yaml", "tickets.csv"):
        shutil.copy(BIZBENCH / f, tmp_path / f)
    monkeypatch.setattr(llm, "complete", fake_complete)
    (tmp_path / ".env").write_text("EVENPOINT_TEST_KEY=from-dotenv\n")
    monkeypatch.delenv("EVENPOINT_TEST_KEY", raising=False)
    monkeypatch.chdir(tmp_path)
    report = tmp_path / "output" / "report.html"

    cli.main(["run", "--yes"])
    assert os.environ.pop("EVENPOINT_TEST_KEY") == "from-dotenv"
    html = report.read_text()
    assert "what to automate" in html and "support-triage" in html and "Step by step" in html

    con = duckdb.connect(str(tmp_path / ".evenpoint" / "project.duckdb"))
    q = lambda sql: con.execute(sql).fetchall()  # noqa: E731

    # Redaction: no emails, phone numbers or staff names reach the store.
    payloads = " ".join(p for (p,) in q("SELECT payload::TEXT FROM events"))
    assert "@example.com" not in payloads and "555 01" not in payloads
    assert not re.search(r"\b(Ana|Ben|Chen|Dana)\b", payloads)

    # "created" is risk 5 (not tested); assigned is classify, solved is draft per evenpoint.yaml overrides.
    cands = dict(q("SELECT activity, testable FROM candidates"))
    assert cands == {"created": False, "assigned": True, "solved": True}
    assert dict(q("SELECT activity, any_value(task_type) FROM tasks GROUP BY 1")) == {
        "assigned": "classify", "solved": "draft"}
    assert q("SELECT count(*) FROM runs WHERE kind = 'task'")[0][0] == 2 * 30 * 2  # steps x tasks x models
    verdicts = {v for (v,) in q("SELECT DISTINCT verdict FROM roi")}
    assert verdicts <= {"automate", "review", "dont_automate"} and verdicts
    con.close()

    # Rerun on a new model only adds that model's calls.
    cli.main(["rerun", "--models", "ollama/llama3.2", "--yes"])
    con = duckdb.connect(str(tmp_path / ".evenpoint" / "project.duckdb"))
    assert con.execute("SELECT count(DISTINCT model) FROM roi").fetchone()[0] == 3
    con.close()

    # Human review round trip.
    review = tmp_path / "output" / "review.csv"
    cli.main(["review", "export", "--n", "3"])
    rows = list(csv.DictReader(open(review)))
    for r in rows:
        r["pass"] = "no"
    with open(review, "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=rows[0].keys())
        w.writeheader()
        w.writerows(rows)
    cli.main(["review", "import"])
    con = duckdb.connect(str(tmp_path / ".evenpoint" / "project.duckdb"))
    assert con.execute("SELECT count(*) FROM grades WHERE grader = 'human'").fetchone()[0] == len(rows)
    con.close()

    # Restart from a later stage keeps earlier tables.
    cli.main(["run", "--from", "roi"])
    assert "what to automate" in report.read_text()


def test_init_writes_config(tmp_path, monkeypatch):
    monkeypatch.chdir(tmp_path)
    shutil.copy(BIZBENCH / "tickets.csv", tmp_path / "tickets.csv")
    cli.main(["init", "tickets.csv", "--adapter", "zendesk"])
    text = (tmp_path / "evenpoint.yaml").read_text()
    assert "adapter: zendesk" in text and "case_id: Id" in text
