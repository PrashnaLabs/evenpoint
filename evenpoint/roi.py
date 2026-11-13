"""Stage 6: turn benchmark results into hours and money saved, with ranges, per step x model x mode."""

import random

from . import db
from .config import MODES

# Per task: human grade if there is one, else the automatic grade.
FINAL_GRADES = """
  SELECT t.activity, g.task_id, g.model,
    coalesce(bool_or(g.passed) FILTER (WHERE g.grader = 'human'),
             bool_or(g.passed) FILTER (WHERE g.grader <> 'human')) AS passed
  FROM grades g JOIN tasks t USING (run_id, task_id)
  WHERE g.run_id = $run
  GROUP BY ALL
"""


def summaries(con, run_id: str) -> list[dict]:
    """Per step x model: accuracy, cost, latency, and how often the LLM judge agrees with humans."""
    rows = con.execute(
        f"""
        WITH final AS ({FINAL_GRADES}),
        cost AS (
          SELECT t.activity, r.model, avg(r.cost_usd) AS cost_per_task,
            quantile_cont(r.latency_ms, 0.5) AS p50, quantile_cont(r.latency_ms, 0.95) AS p95,
            avg((r.error IS NOT NULL)::INT) AS error_rate
          FROM runs r JOIN tasks t USING (run_id, task_id)
          WHERE r.run_id = $run AND r.kind = 'task' GROUP BY ALL),
        agree AS (
          SELECT t.activity, h.model, avg((h.passed = j.passed)::INT) AS agreement
          FROM grades h JOIN grades j USING (run_id, task_id, model) JOIN tasks t USING (run_id, task_id)
          WHERE h.run_id = $run AND h.grader = 'human' AND j.grader = 'llm_judge' GROUP BY ALL)
        SELECT f.activity, f.model, list(f.passed::INT ORDER BY f.task_id) AS passes,
          any_value(c.cost_per_task), any_value(c.p50), any_value(c.p95), any_value(c.error_rate),
          any_value(a.agreement)
        FROM final f JOIN cost c USING (activity, model) LEFT JOIN agree a USING (activity, model)
        GROUP BY f.activity, f.model ORDER BY f.activity, f.model
        """,
        {"run": run_id},
    ).fetchall()
    out = []
    for activity, model, passes, cost, p50, p95, err, agree in rows:
        n_pass = sum(passes)
        out.append({
            "activity": activity, "model": model, "passes": passes, "n": len(passes),
            "accuracy": n_pass / len(passes),
            "cost_per_task": cost or 0.0,
            "cost_per_success": (cost or 0.0) * len(passes) / n_pass if n_pass else None,
            "latency_p50_ms": p50, "latency_p95_ms": p95, "error_rate": err,
            "judge_human_agreement": agree,
        })
    return out


def bootstrap(passes: list[int], n: int = 1000, seed: int = 0) -> tuple[float, float]:
    """95% interval for accuracy by resampling the test results."""
    rng = random.Random(seed)
    k = len(passes)
    accs = sorted(sum(rng.choices(passes, k=k)) / k for _ in range(n))
    return accs[int(0.025 * n)], accs[int(0.975 * n) - 1]


def net_hours(volume: float, baseline_min: float, review_min: float, accuracy: float, failure_min: float) -> float:
    return volume * (baseline_min - review_min) / 60 - volume * (1 - accuracy) * failure_min / 60


def compute(con, run_id: str, cfg) -> list[dict]:
    steps = {r[0]: r[1:] for r in con.execute(
        "SELECT activity, volume_per_month, median_minutes FROM steps WHERE run_id = ?", [run_id]).fetchall()}
    risk = dict(con.execute("SELECT activity, risk FROM candidates WHERE run_id = ?", [run_id]).fetchall())

    rows = []
    for s in summaries(con, run_id):
        volume, baseline_min = steps[s["activity"]]
        lo_acc, hi_acc = bootstrap(s["passes"], seed=cfg.bench.seed)
        ai_cost = volume * s["cost_per_task"]
        for mode in MODES:
            review = cfg.review_minutes.for_mode(mode)

            def hours(acc):
                return net_hours(volume, baseline_min, review, acc, cfg.failure_minutes)

            value = hours(s["accuracy"]) * cfg.hourly_rate - ai_cost
            value_low = hours(lo_acc) * cfg.hourly_rate - ai_cost
            if risk.get(s["activity"], 1) >= 5:
                verdict, reason = "dont_automate", "Risk of a wrong output is too high."
            elif value_low > 0:
                verdict = "automate" if mode == "auto" else "review"
                reason = f"Saves money even at the low end of accuracy ({lo_acc:.0%})."
            else:
                verdict = "dont_automate"
                reason = f"At the low end of accuracy ({lo_acc:.0%}) this loses ${-value_low:,.0f}/month."
            rows.append({
                "run_id": run_id, "activity": s["activity"], "model": s["model"], "mode": mode,
                "accuracy": s["accuracy"],
                "net_hours_month": hours(s["accuracy"]),
                "net_hours_low": hours(lo_acc),
                "net_hours_high": hours(hi_acc),
                "net_value_month": value,
                "net_value_low": value_low,
                "ai_cost_month": ai_cost,
                "payback_months": cfg.setup_cost_usd / value if value > 0 else None,
                "verdict": verdict,
                "reason": reason,
            })
    db.insert(con, "roi", rows)
    return rows
