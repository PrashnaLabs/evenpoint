"""Command line: evenpoint init | run | rerun | review | report."""

import argparse
import sys
from pathlib import Path

import yaml
from dotenv import load_dotenv

from . import __version__, adapters, db, pipeline
from .bench import graders
from .config import Config
from .report import render

TEMPLATE = """\
# Evenpoint config. Every number here shows up in the report's assumptions.
project: {project}
hourly_rate: 35            # USD per hour, fully loaded

sources:
  - adapter: {adapter}
    path: {path}
    mapping: {mapping}

# Optional per-step overrides. Timestamps include waiting time, so set real work minutes where you know them.
# steps:
#   assigned: {{ minutes: 2 }}
#   solved:   {{ minutes: 8, task_type: draft, input: text, expected: reply }}

models:                    # any LiteLLM model string; API keys come from .env next to this file, or the environment
  - openai/gpt-5.4-mini
  - openai/gpt-5.4-nano
  # - ollama/llama3.2       # local: nothing leaves your machine

labeler_model: openai/gpt-5.4-mini
judge_model: openai/gpt-5.4

bench:
  tasks_per_candidate: 50
  max_cost_usd: 10         # ask before spending more than this

review_minutes:            # human minutes per AI output
  auto: 0
  draft_review: 1.5
failure_minutes: 10        # extra minutes when a wrong AI output reaches a customer, on top of redoing it
setup_cost_usd: 2000       # one-off cost to put an automation in place
"""


def cmd_init(args) -> None:
    out = Path(args.config)
    if out.exists() and not args.force:
        sys.exit(f"{out} already exists (use --force to overwrite)")
    mapping = adapters.DEFAULT_MAPPINGS[args.adapter]
    if args.adapter == "csv":
        import csv

        with open(args.export, newline="", encoding="utf-8-sig") as f:
            headers = next(csv.reader(f), [])
        mapping = {"case_id": "?", "activity": "?", "ts": "?", "actor": "?", "fields": {"text": "?"}}
        print(f"Fill in the mapping in {out}. Columns found: {', '.join(headers)}")
    elif args.adapter == "mbox":
        mapping = {"team": ["@your-company.com"]}
    mapping_yaml = "\n" + "\n".join("      " + line for line in yaml.safe_dump(mapping, sort_keys=False).splitlines())
    out.write_text(TEMPLATE.format(project=Path(args.export).stem, adapter=args.adapter,
                                   path=args.export, mapping=mapping_yaml))
    print(f"Wrote {out}. Check the mapping and models, then run: evenpoint run")


def _confirmer(yes: bool):
    def confirm(estimate: float, limit: float) -> None:
        print(f"Estimated model cost: ${estimate:,.2f}")
        if estimate <= limit or yes:
            return
        if not sys.stdin.isatty():
            sys.exit(f"Estimate is above max_cost_usd (${limit:,.2f}). Re-run with --yes to proceed.")
        if input("Above max_cost_usd. Continue? [y/N] ").strip().lower() != "y":
            sys.exit("Stopped before calling any model.")
    return confirm


def _open(args) -> tuple:
    cfg = Config.load(args.config)
    # API keys: .env next to evenpoint.yaml, then .env in the current folder. Real env vars win over both.
    load_dotenv(cfg.root / ".env")
    load_dotenv(Path.cwd() / ".env")
    cfg.output_path.mkdir(parents=True, exist_ok=True)
    if hasattr(args, "out"):
        args.out = Path(args.out) if args.out else cfg.output_path / "report.html"
    if hasattr(args, "file"):
        args.file = Path(args.file) if args.file else cfg.output_path / "review.csv"
    return cfg, db.connect(cfg.project_dir)


def cmd_run(args) -> None:
    cfg, con = _open(args)
    if args.from_stage == "ingest":
        run_id = pipeline.new_run(con, cfg)
    else:
        run_id = db.latest_run(con)
        db.clear_from(con, run_id, args.from_stage)
    print(f"run {run_id}")
    pipeline.run_stages(con, run_id, cfg, args.from_stage, args.out, confirm=_confirmer(args.yes))


def cmd_rerun(args) -> None:
    """Run the saved test cases on new models and refresh the report, without redoing anything else."""
    cfg, con = _open(args)
    models = [m.strip() for m in args.models.split(",") if m.strip()]
    pipeline.rerun(con, cfg, models, args.out, confirm=_confirmer(args.yes))


def cmd_review(args) -> None:
    cfg, con = _open(args)
    run_id = db.latest_run(con)
    if args.action == "export":
        n = graders.export_review(con, run_id, args.n, Path(args.file), seed=cfg.bench.seed)
        print(f"Wrote {n} outputs to {args.file}. Fill the 'pass' column with yes/no, then: "
              f"evenpoint review import {args.file}")
    else:
        print(f"Imported {graders.import_review(con, run_id, Path(args.file))} human grades")
        pipeline.run_stages(con, run_id, cfg, "roi", args.out)


def cmd_report(args) -> None:
    cfg, con = _open(args)
    print(render.render(con, db.latest_run(con), cfg, args.out))


def main(argv: list[str] | None = None) -> None:
    p = argparse.ArgumentParser(prog="evenpoint", description="Exports in, ROI out: what to automate with AI.")
    p.add_argument("--version", action="version", version=__version__)
    p.add_argument("-c", "--config", default="evenpoint.yaml")
    sub = p.add_subparsers(required=True)

    s = sub.add_parser("init", help="write evenpoint.yaml for an export")
    s.add_argument("export")
    s.add_argument("--adapter", choices=list(adapters.DEFAULT_MAPPINGS), default="csv")
    s.add_argument("--force", action="store_true")
    s.set_defaults(fn=cmd_init)

    s = sub.add_parser("run", help="run the pipeline (all stages, or from one stage on the latest run)")
    s.add_argument("--from", dest="from_stage", choices=db.STAGES, default="ingest")
    s.add_argument("--yes", action="store_true", help="don't ask before spending above max_cost_usd")
    s.add_argument("--out", help="default: <output_dir>/report.html")
    s.set_defaults(fn=cmd_run)

    s = sub.add_parser("rerun", help="run saved test cases on new models")
    s.add_argument("--models", required=True, help="comma-separated LiteLLM model strings")
    s.add_argument("--yes", action="store_true")
    s.add_argument("--out", help="default: <output_dir>/report.html")
    s.set_defaults(fn=cmd_rerun)

    s = sub.add_parser("review", help="human spot-check: export outputs to CSV, import your grades")
    s.add_argument("action", choices=["export", "import"])
    s.add_argument("file", nargs="?", help="default: <output_dir>/review.csv")
    s.add_argument("--n", type=int, default=10, help="outputs per model to export")
    s.add_argument("--out", help="default: <output_dir>/report.html")
    s.set_defaults(fn=cmd_review)

    s = sub.add_parser("report", help="re-render the report for the latest run")
    s.add_argument("--out", help="default: <output_dir>/report.html")
    s.set_defaults(fn=cmd_report)

    args = p.parse_args(argv)
    try:
        args.fn(args)
    except (ValueError, FileNotFoundError) as e:
        sys.exit(f"error: {e}")


if __name__ == "__main__":
    main()
