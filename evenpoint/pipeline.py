"""Run pipeline stages. Shared by the CLI and the web UI, which differ only in the callbacks they pass:
`log` for messages, `on_stage` when a stage starts, `progress` for model calls, and `confirm` to
approve the estimated spend before any model is called."""

import json
from pathlib import Path
from typing import Callable

from . import __version__, baseline, db, llm, normalize, roi, score
from .bench import graders, runner, tasks
from .report import render


class Cancelled(Exception):
    """Raised by a callback to stop the run between steps."""


def _noop(*_args) -> None:
    pass


def new_run(con, cfg) -> str:
    return db.new_run(con, cfg.raw, llm.pricing_snapshot(cfg.models + [cfg.labeler_model, cfg.judge_model]),
                      __version__)


def run_stages(con, run_id: str, cfg, start: str, out: Path, models: list[str] | None = None, *,
               log: Callable = print, confirm: Callable = _noop, on_stage: Callable = _noop,
               progress: Callable | None = None) -> Path:
    """Run `start` and every later stage. With `models` other than the configured ones, only runs
    those models on the saved test cases (rerun) and refreshes grades, ROI and the report."""
    models = models or cfg.models
    extra = models != cfg.models
    stages = db.STAGES[db.STAGES.index(start):]

    if "ingest" in stages:
        on_stage("ingest")
        n = normalize.ingest(con, run_id, cfg)
        q = normalize.quality_summary(con, run_id)
        log(f"ingest: {n:,} events, {q['cases']:,} cases")
        for w in q["warnings"]:
            log(f"  warning: {w}")
    if "baseline" in stages:
        on_stage("baseline")
        log(f"baseline: {len(baseline.compute(con, run_id, cfg))} steps")
    if "score" in stages:
        on_stage("score")
        cands = score.label_steps(con, run_id, cfg)
        log(f"score: {len(cands)} candidates, {sum(c['testable'] for c in cands)} testable")
    if "bench" in stages:
        on_stage("bench")
        cands = con.execute(
            "SELECT activity, task_type, input_field, expected_field FROM candidates "
            "WHERE run_id = ? AND testable ORDER BY rank LIMIT ?", [run_id, cfg.max_candidates]).fetchall()
        built = []
        for activity, ttype, inp, exp in cands:
            c = dict(activity=activity, task_type=ttype, input_field=inp, expected_field=exp)
            built += tasks.build(con, run_id, c, cfg.bench.tasks_per_candidate, cfg.bench.few_shot, cfg.bench.seed)
        log(f"bench: {len(built)} test cases across {len(cands)} steps")
        confirm(tasks.estimate_cost(built, models, cfg.judge_model), cfg.bench.max_cost_usd)
    if "bench" in stages or extra:
        on_stage("bench")
        calls, failed, first_error = runner.run(con, run_id, models, cfg.bench.workers, progress=progress, log=log)
        if failed:
            log(f"  warning: {failed} of {calls} model calls failed. First error: {first_error}")
    if "grade" in stages or extra:
        on_stage("grade")
        log(f"grade: {graders.grade_all(con, run_id, cfg.judge_model, cfg.bench.workers)} new grades")
    if "roi" in stages or extra:
        on_stage("roi")
        con.execute("DELETE FROM roi WHERE run_id = ?", [run_id])
        log(f"roi: {len(roi.compute(con, run_id, cfg))} options")
    on_stage("report")
    path = render.render(con, run_id, cfg, out)
    log(f"report: {path}")
    return path


def rerun(con, cfg, models: list[str], out: Path, confirm: Callable = _noop, **callbacks) -> Path:
    """Run the latest run's saved test cases on more models, then refresh grades, ROI and report."""
    run_id = db.latest_run(con)
    prompts = [p for (p,) in con.execute("SELECT prompt FROM tasks WHERE run_id = ?", [run_id]).fetchall()]
    confirm(sum(llm.estimate_cost(m, p, 200) for m in models for p in prompts), cfg.bench.max_cost_usd)
    con.execute("UPDATE run_meta SET pricing_snapshot = json_merge_patch(pricing_snapshot, ?) WHERE run_id = ?",
                [json.dumps(llm.pricing_snapshot(models)), run_id])
    return run_stages(con, run_id, cfg, "report", out, models=models, **callbacks)
