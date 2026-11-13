"""Stage 7: render everything stored for a run into one self-contained HTML file."""

import base64
import json
from datetime import datetime
from pathlib import Path

from jinja2 import Environment, FileSystemLoader, select_autoescape

from .. import __version__, normalize, roi

VERDICT_ORDER = {"automate": 0, "review": 1, "dont_automate": 2}


def _rows(con, sql: str, run_id: str) -> list[dict]:
    cur = con.execute(sql, [run_id])
    cols = [d[0] for d in cur.description]
    return [dict(zip(cols, r)) for r in cur.fetchall()]


def gather(con, run_id: str, cfg) -> dict:
    meta = _rows(con, "SELECT * FROM run_meta WHERE run_id = ?", run_id)[0]
    roi_rows = _rows(con, "SELECT * FROM roi WHERE run_id = ? ORDER BY activity, net_value_month DESC", run_id)
    best = {}
    for r in sorted(roi_rows, key=lambda r: (VERDICT_ORDER[r["verdict"]], -r["net_value_month"])):
        best.setdefault(r["activity"], r)
    candidates = _rows(con, "SELECT * FROM candidates WHERE run_id = ? ORDER BY rank", run_id)
    tested = {r["activity"] for r in roi_rows}
    dont = [r for r in best.values() if r["verdict"] == "dont_automate"]
    dont += [{"activity": c["activity"], "model": None, "reason": c["reason"]}
             for c in candidates if c["activity"] not in tested and (c["risk"] >= 5 or not c["testable"])]
    models = sorted({r["model"] for r in _rows(con, "SELECT DISTINCT model FROM runs WHERE run_id = ?", run_id)})
    calls = _rows(con, "SELECT kind, model, count(*) AS n, count(error) AS errors, sum(cost_usd) AS cost "
                       "FROM runs WHERE run_id = ? GROUP BY ALL ORDER BY kind, model", run_id)
    pricing = json.loads(meta["pricing_snapshot"] or "{}")
    return {
        "cfg": cfg,
        "meta": meta,
        "version": __version__,
        "generated": datetime.now(),
        "quality": normalize.quality_summary(con, run_id),
        "steps": _rows(con, "SELECT * FROM steps WHERE run_id = ? ORDER BY baseline_hours_month DESC", run_id),
        "edges": _rows(con, "SELECT * FROM edges WHERE run_id = ? ORDER BY n DESC LIMIT 30", run_id),
        "candidates": candidates,
        "summaries": roi.summaries(con, run_id),
        "roi": roi_rows,
        "best": sorted(best.values(), key=lambda r: (VERDICT_ORDER[r["verdict"]], -r["net_value_month"])),
        "dont": dont,
        "calls": calls,
        "total_cost": sum(c["cost"] or 0 for c in calls),
        "providers": sorted({m.split("/")[0] for m in models}),
        "unpriced": [m for m in models if not pricing.get(m)],
    }


def _usd(v, d=0) -> str:
    if v is None:
        return "–"
    shown = f"{abs(v):,.{d}f}"
    return f"{'−' if v < 0 and float(shown.replace(',', '')) else ''}${shown}"  # no "−$0"


def _hrs(v) -> str:
    """Hours; small values keep one decimal so 0.9 h doesn't read as 1 h."""
    if v is None:
        return "–"
    return f"{'−' if v < 0 else ''}{abs(v):,.{1 if abs(v) < 10 else 0}f} h"


def _report_view(data: dict, cfg) -> dict:
    """What the shareable report needs on top of `gather`: value ranges and range-bar positions."""
    best = data["best"]
    lo = min([0.0] + [r["net_hours_low"] for r in best])
    hi = max([0.0] + [r["net_hours_high"] for r in best])
    span = (hi - lo) or 1.0

    def pos(v):
        return round((min(max(v, lo), hi) - lo) / span * 100, 2)

    for r in best:
        r["value_high"] = r["net_hours_high"] * cfg.hourly_rate - r["ai_cost_month"]
        left, right = sorted((r["net_hours_low"], r["net_hours_high"]))
        r["bar"] = {"left": pos(left), "width": pos(right) - pos(left), "point": pos(r["net_hours_month"]),
                    "zero": pos(0)}
    worth = [r for r in best if r["verdict"] != "dont_automate"]
    n = {(s["activity"], s["model"]): s["n"] for s in data["summaries"]}
    return {
        **data,
        "worth": worth,
        "untested": [d for d in data["dont"] if not d.get("model")],
        "n_cases": n,
        "totals": {k: sum(r[k] for r in worth) for k in ("net_hours_month", "net_hours_low", "net_hours_high",
                                                         "net_value_month", "net_value_low", "value_high")},
        "scale": {"lo": lo, "hi": hi, "zero": pos(0)},
        "font": base64.b64encode((Path(__file__).parent / "plus-jakarta-sans.woff2").read_bytes()).decode(),
    }


def render(con, run_id: str, cfg, out: Path) -> Path:
    env = Environment(loader=FileSystemLoader(Path(__file__).parent), autoescape=select_autoescape(["j2"]))
    env.filters["num"] = lambda v, d=0: "–" if v is None else f"{v:,.{d}f}"
    env.filters["pct"] = lambda v: "–" if v is None else f"{v:.0%}"
    env.filters["usd"] = _usd
    env.filters["hrs"] = _hrs
    env.filters["model"] = lambda m: (m or "").split("/", 1)[-1]
    env.filters["provider"] = lambda p: {"openai": "OpenAI", "anthropic": "Anthropic", "gemini": "Google",
                                         "ollama": "a local model"}.get(p, p)
    env.filters["step"] = lambda s: (s or "").replace("_", " ").replace(":", " ").strip().capitalize()
    html = env.get_template("template.html.j2").render(**_report_view(gather(con, run_id, cfg), cfg))
    out.write_text(html)
    return out
