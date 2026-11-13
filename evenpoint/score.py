"""Stage 4: an LLM labels each step against a rubric; steps are ranked by hours at stake x AI fit."""

import json
import random

from . import db, llm
from .config import TASK_TYPES

PROMPT = """You are assessing whether one step of a business workflow can be done by an AI model.

Step: {activity}
Volume: {volume:.0f} per month, {minutes:.1f} minutes each, handoff rate {handoff:.0%}, rework rate {rework:.0%}.
Fields recorded on each case: {fields}

Sample cases (PII redacted):
{samples}

Score the step from 1 to 5 on each:
- repetitive: 5 = the same kind of work every time
- structured: 5 = the output is a choice from a fixed set or a fixed format
- risk: 5 = a wrong output causes serious harm (money, legal, safety, losing a customer)

Then choose how to test an AI on this step, using only the fields listed above:
- task_type: "classify" (pick a label), "extract" (copy or derive a short value) or "draft" (write text)
- input_field: the field the AI would read
- expected_field: the field holding what a person actually produced in this step, or null if none does

Reply with only JSON:
{{"repetitive": 1-5, "structured": 1-5, "risk": 1-5, "task_type": "...", "input_field": "...", "expected_field": "..." or null, "reason": "one sentence"}}"""


def fit_score(baseline_hours: float, repetitive: int, structured: int, risk: int) -> float:
    return baseline_hours * (repetitive + structured) / 10 * (1 - (risk - 1) / 4)


def _valid(label: dict | None) -> str | None:
    """Return a problem description, or None if the labeler output is usable."""
    if not label:
        return "labeler reply was not JSON"
    for k in ("repetitive", "structured", "risk"):
        if not isinstance(label.get(k), int) or not 1 <= label[k] <= 5:
            return f"labeler gave invalid {k}"
    if label.get("task_type") not in TASK_TYPES:
        return "labeler gave invalid task_type"
    return None


def label_steps(con, run_id: str, cfg) -> list[dict]:
    steps = con.execute(
        "SELECT activity, volume_per_month, median_minutes, handoff_rate, rework_rate, baseline_hours_month "
        "FROM steps WHERE run_id = ? AND volume_per_month >= ?",
        [run_id, cfg.min_volume_per_month],
    ).fetchall()
    payloads = db.case_payloads(con, run_id)
    fields = sorted({k for p in payloads.values() for k in p})
    rng = random.Random(cfg.bench.seed)
    sample_ids = rng.sample(sorted(payloads), min(8, len(payloads)))
    samples = "\n".join(
        json.dumps({k: str(v)[:300] for k, v in payloads[c].items()}, ensure_ascii=False) for c in sample_ids
    )

    candidates, logs = [], []
    for activity, volume, minutes, handoff, rework, hours in steps:
        prompt = PROMPT.format(activity=activity, volume=volume, minutes=minutes, handoff=handoff,
                               rework=rework, fields=", ".join(fields) or "(none)", samples=samples or "(none)")
        reply = llm.complete(cfg.labeler_model, prompt)
        logs.append(llm.log_row(run_id, "label", activity, cfg.labeler_model, prompt, reply))
        label = llm.parse_json(reply.text)
        problem = reply.error or _valid(label)
        if problem:
            print(f"warning: skipped step {activity!r}: {problem}")
            continue

        o = cfg.steps.get(activity)
        task_type = (o and o.task_type) or label["task_type"]
        input_field = (o and o.input) or label.get("input_field")
        expected_field = (o and o.expected) or label.get("expected_field")
        reason = label.get("reason", "")
        testable = input_field in fields and expected_field in fields and input_field != expected_field
        if not testable:
            reason += " (Not testable: no field records what a person produced in this step.)"
        if label["risk"] >= 5:
            testable = False

        candidates.append({
            "run_id": run_id,
            "activity": activity,
            "repetitive": label["repetitive"],
            "structured": label["structured"],
            "risk": label["risk"],
            "task_type": task_type,
            "input_field": input_field,
            "expected_field": expected_field,
            "fit_score": fit_score(hours, label["repetitive"], label["structured"], label["risk"]),
            "rank": 0,
            "testable": testable,
            "reason": reason.strip(),
        })

    candidates.sort(key=lambda c: c["fit_score"], reverse=True)
    for i, c in enumerate(candidates, 1):
        c["rank"] = i
    db.insert(con, "runs", logs)
    db.insert(con, "candidates", candidates)
    return candidates
