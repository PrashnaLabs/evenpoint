"""Stage 7: render everything stored for a run into one self-contained HTML file."""

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


def render(con, run_id: str, cfg, out: Path) -> Path:
    env = Environment(loader=FileSystemLoader(Path(__file__).parent), autoescape=select_autoescape(["j2"]))
    env.filters["num"] = lambda v, d=0: "–" if v is None else f"{v:,.{d}f}"
    env.filters["pct"] = lambda v: "–" if v is None else f"{v:.0%}"
    env.filters["usd"] = lambda v, d=0: "–" if v is None else f"${v:,.{d}f}"
    html = env.get_template("template.html.j2").render(**gather(con, run_id, cfg))
    out.write_text(html)
    return out
