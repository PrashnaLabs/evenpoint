"""Turn the Kaggle "multilingual customer support tickets" dataset into an Evenpoint-ready export.

Dataset: https://www.kaggle.com/datasets/tobiasbueck/multilingual-customer-support-tickets
(synthetic tickets in English and German: subject, body, agent answer, queue, priority, type).

The dataset has no ticket ids or timestamps, so this script adds them:
- Id: row number.
- Created at: tickets spread evenly over one year (that sets volume per month; an assumption).
- Routed / Prioritized / Answered at: fixed offsets after creation, only to order the steps.
  Work minutes per step come from evenpoint.yaml, not from these timestamps.

Usage (from the repo root):
  python bizbench/kaggle-support-tickets/prepare.py exports/kaggle-support-tickets/raw/aa_dataset-tickets-multi-lang-5-2-50-version.csv
"""

import csv
import sys
from datetime import datetime, timedelta
from pathlib import Path

START = datetime(2025, 1, 1, 8)
SPAN = timedelta(days=365)
OFFSETS = {"Routed at": timedelta(minutes=5), "Prioritized at": timedelta(minutes=6),
           "Answered at": timedelta(hours=4)}


def clean(s: str | None) -> str:
    return (s or "").replace("\\n", "\n").strip()


def main(src: Path, out: Path) -> None:
    csv.field_size_limit(10_000_000)
    with open(src, newline="", encoding="utf-8") as f:
        rows = [r for r in csv.DictReader(f) if clean(r.get("body")) and clean(r.get("answer"))]

    fmt = "%Y-%m-%d %H:%M:%S +0000"
    out.parent.mkdir(parents=True, exist_ok=True)
    with open(out, "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["Id", "Subject", "Text", "Answer", "Queue", "Priority", "Type", "Language",
                    "Created at", *OFFSETS])
        for i, r in enumerate(rows):
            created = START + SPAN * i / len(rows)
            subject, body = clean(r.get("subject")), clean(r["body"])
            w.writerow([
                i + 1, subject, f"{subject}\n\n{body}" if subject else body, clean(r["answer"]),
                r["queue"], r["priority"], r["type"], r["language"],
                created.strftime(fmt), *[(created + d).strftime(fmt) for d in OFFSETS.values()],
            ])
    print(f"wrote {len(rows):,} tickets to {out}")


if __name__ == "__main__":
    src = Path(sys.argv[1])
    out = Path(sys.argv[2]) if len(sys.argv) > 2 else Path("exports/kaggle-support-tickets/tickets.csv")
    main(src, out)
