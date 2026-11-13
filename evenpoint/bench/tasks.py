"""Turn sampled real cases into test cases. The expected answer is what a person actually did."""

import random
from collections import Counter

from .. import db, llm

MAX_INPUT_CHARS = 4000
OUTPUT_TOKENS = {"classify": 20, "extract": 50, "draft": 400}

INSTRUCTIONS = {
    "classify": "Read the {input_field} and choose the {expected_field}.\nAllowed values: {labels}\n"
                "Reply with only the value.",
    "extract": "Read the {input_field} and give the {expected_field}.\nReply with only the value.",
    "draft": "Read the {input_field} and write the {expected_field}, as the person doing this step would.\n"
             "Reply with only the text.",
}


def _prompt(c: dict, shots: list[tuple[str, str]], labels: list[str], text: str) -> str:
    inp, exp = c["input_field"], c["expected_field"]
    parts = [
        f'You are doing one step of a business workflow: "{c["activity"]}".',
        INSTRUCTIONS[c["task_type"]].format(input_field=inp, expected_field=exp, labels=" | ".join(labels)),
    ]
    if shots:
        parts.append("Examples:\n\n" + "\n\n".join(f"{inp}: {i}\n{exp}: {e}" for i, e in shots))
    parts.append(f"{inp}: {text}\n{exp}:")
    return "\n\n".join(parts)


def build(con, run_id: str, candidate: dict, n: int, few_shot: int, seed: int) -> list[dict]:
    inp, exp = candidate["input_field"], candidate["expected_field"]
    payloads = db.case_payloads(con, run_id)
    usable = sorted(cid for cid, p in payloads.items() if str(p.get(inp, "")).strip() and str(p.get(exp, "")).strip())
    # ponytail: plain random sample; stratify by process variant if rare variants get missed.
    random.Random(f"{seed}:{candidate['activity']}").shuffle(usable)
    shot_ids, test_ids = usable[:few_shot], usable[few_shot:few_shot + n]

    def clip(v) -> str:
        return str(v)[:MAX_INPUT_CHARS]

    shots = [(clip(payloads[c][inp]), clip(payloads[c][exp])) for c in shot_ids]
    labels = []
    if candidate["task_type"] == "classify":
        labels = [v for v, _ in Counter(str(p[exp]) for p in payloads.values() if p.get(exp)).most_common(50)]

    tasks = [{
        "run_id": run_id,
        "task_id": f"{candidate['activity']}:{cid}",
        "activity": candidate["activity"],
        "case_id": cid,
        "task_type": candidate["task_type"],
        "input": clip(payloads[cid][inp]),
        "expected": clip(payloads[cid][exp]),
        "prompt": _prompt(candidate, shots, labels, clip(payloads[cid][inp])),
    } for cid in test_ids]
    con.execute("DELETE FROM tasks WHERE run_id = ? AND activity = ?", [run_id, candidate["activity"]])
    db.insert(con, "tasks", tasks)
    return tasks


def estimate_cost(tasks: list[dict], models: list[str], judge_model: str) -> float:
    total = 0.0
    for t in tasks:
        out = OUTPUT_TOKENS[t["task_type"]]
        for m in models:
            total += llm.estimate_cost(m, t["prompt"], out)
            if t["task_type"] == "draft":  # judge reads input + reference + output
                total += llm.estimate_cost(judge_model, t["input"] + t["expected"] + "x" * out * 4, 60)
    return total
