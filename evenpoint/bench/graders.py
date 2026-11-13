"""Grade model outputs: exact match for classify/extract, LLM judge for draft, and a human
spot-check round trip through CSV. Human grades override automatic ones."""

import csv
import random
import re
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from .. import db, llm

JUDGE_PROMPT = """You are checking an AI-written answer against the one a person actually wrote for the same case.

Case input:
{input}

Reference (written by a person):
{expected}

AI output:
{output}

Pass the AI output only if a reviewer could send it without edits that change its meaning: it is correct,
complete enough and safe. Wording may differ from the reference.

Reply with only JSON: {{"pass": true or false, "score": 1-5, "note": "one sentence"}}"""

YES, NO = {"y", "yes", "1", "true", "pass"}, {"n", "no", "0", "false", "fail"}


def normalize(s: str) -> str:
    return re.sub(r"\s+", " ", s.strip().strip("\"'`.").strip()).lower()


def exact(expected: str, output: str) -> bool:
    return normalize(expected) == normalize(output)


def _grade(run_id, task_id, model, grader, passed, score, note) -> dict:
    return dict(run_id=run_id, task_id=task_id, model=model, grader=grader, passed=passed, score=score, note=note)


def grade_all(con, run_id: str, judge_model: str, workers: int) -> int:
    pending = con.execute(
        """
        SELECT r.task_id, r.model, r.output, r.error, t.task_type, t.input, t.expected
        FROM runs r JOIN tasks t USING (run_id, task_id)
        WHERE r.run_id = ? AND r.kind = 'task' AND NOT EXISTS (
          SELECT 1 FROM grades g WHERE g.run_id = r.run_id AND g.task_id = r.task_id
            AND g.model = r.model AND g.grader <> 'human')
        """,
        [run_id],
    ).fetchall()

    grades, to_judge = [], []
    for tid, model, output, error, ttype, inp, expected in pending:
        if error:
            grades.append(_grade(run_id, tid, model, "exact" if ttype != "draft" else "llm_judge", False, 0.0,
                                 "model call failed"))
        elif ttype == "draft":
            to_judge.append((tid, model, JUDGE_PROMPT.format(input=inp, expected=expected, output=output)))
        else:
            ok = exact(expected, output)
            grades.append(_grade(run_id, tid, model, "exact", ok, float(ok), None))

    with ThreadPoolExecutor(workers) as ex:
        replies = list(ex.map(lambda j: llm.complete(judge_model, j[2], 200), to_judge))
    logs = []
    for (tid, model, prompt), reply in zip(to_judge, replies):
        logs.append(llm.log_row(run_id, "judge", f"{tid}|{model}", judge_model, prompt, reply))
        verdict = llm.parse_json(reply.text) or {}
        passed = verdict.get("pass") is True
        note = reply.error or verdict.get("note") or ("judge reply unreadable" if not verdict else None)
        grades.append(_grade(run_id, tid, model, "llm_judge", passed, float(verdict.get("score") or 0), note))

    db.insert(con, "runs", logs)
    db.insert(con, "grades", grades)
    return len(grades)


def review_items(con, run_id: str, per_model: int, seed: int = 0) -> list[dict]:
    """A random sample of successful outputs per model, with any human grade already given."""
    cur = con.execute(
        """
        SELECT r.task_id, r.model, t.activity, t.task_type, t.input, t.expected, r.output,
          bool_or(g.passed) FILTER (WHERE g.grader <> 'human') AS auto_pass,
          bool_or(g.passed) FILTER (WHERE g.grader = 'human') AS human_pass,
          any_value(g.note) FILTER (WHERE g.grader <> 'human') AS note
        FROM runs r JOIN tasks t USING (run_id, task_id)
        LEFT JOIN grades g ON g.run_id = r.run_id AND g.task_id = r.task_id AND g.model = r.model
        WHERE r.run_id = ? AND r.kind = 'task' AND r.error IS NULL
        GROUP BY ALL ORDER BY r.model, r.task_id
        """,
        [run_id],
    )
    cols = [d[0] for d in cur.description]
    by_model: dict[str, list] = {}
    for r in cur.fetchall():
        by_model.setdefault(r[1], []).append(dict(zip(cols, r)))
    rng = random.Random(seed)
    return [r for rs in by_model.values() for r in rng.sample(rs, min(per_model, len(rs)))]


def save_human_grades(con, run_id: str, marks: list[tuple[str, str, bool]]) -> int:
    """Store (task_id, model, passed) human grades, replacing earlier ones for the same output."""
    for task_id, model, _ in marks:
        con.execute("DELETE FROM grades WHERE run_id = ? AND task_id = ? AND model = ? AND grader = 'human'",
                    [run_id, task_id, model])
    db.insert(con, "grades", [_grade(run_id, t, m, "human", ok, float(ok), None) for t, m, ok in marks])
    return len(marks)


def export_review(con, run_id: str, per_model: int, path: Path, seed: int = 0) -> int:
    items = review_items(con, run_id, per_model, seed)
    with open(path, "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["task_id", "model", "input", "expected", "output", "auto_pass", "pass"])
        for r in items:
            w.writerow([r["task_id"], r["model"], r["input"], r["expected"], r["output"], r["auto_pass"], ""])
    return len(items)


def import_review(con, run_id: str, path: Path) -> int:
    marks = []
    with open(path, newline="") as f:
        for row in csv.DictReader(f):
            mark = (row.get("pass") or "").strip().lower()
            if mark in YES | NO:
                marks.append((row["task_id"], row["model"], mark in YES))
    return save_human_grades(con, run_id, marks)
