"""CSV adapter for Zendesk, Jira and any other tabular export.

Two shapes are supported:

- wide (one row per case): mapping has `timestamps: {activity: column}`; each filled
  timestamp cell becomes an event.
- long (one row per event): mapping has `activity` and `ts` columns.
"""

import csv
import sys
from datetime import datetime, timezone
from pathlib import Path


def parse_ts(value: str, fmt: str | None = None) -> datetime:
    value = value.strip()
    try:
        dt = datetime.strptime(value, fmt) if fmt else datetime.fromisoformat(value)
    except ValueError:
        raise ValueError(f"can't parse timestamp {value!r}; set ts_format in the source mapping") from None
    if dt.tzinfo:
        dt = dt.astimezone(timezone.utc).replace(tzinfo=None)
    return dt


def read(path: Path, mapping: dict) -> list[dict]:
    with open(path, newline="", encoding="utf-8-sig") as f:
        rows = list(csv.DictReader(f))
    if not rows:
        return []
    headers = list(rows[0])

    def need(key: str) -> str:
        col = mapping.get(key)
        if not col:
            raise ValueError(f"{path.name}: mapping needs '{key}'")
        if col not in headers:
            raise ValueError(f"{path.name}: column {col!r} not found. Columns are: {', '.join(headers)}")
        return col

    def present(cols: dict, what: str) -> dict:
        missing = [c for c in cols.values() if c not in headers]
        if missing:
            print(f"warning: {path.name}: {what} columns not found, skipped: {', '.join(missing)}", file=sys.stderr)
        return {k: c for k, c in cols.items() if c in headers}

    case_col = need("case_id")
    actor_col = mapping.get("actor") if mapping.get("actor") in headers else None
    fields = present(mapping.get("fields", {}), "field")
    fmt = mapping.get("ts_format")

    def payload(r: dict) -> dict:
        return {k: r[c].strip() for k, c in fields.items() if r[c] and r[c].strip()}

    events = []
    if "activity" in mapping:
        act_col, ts_col = need("activity"), need("ts")
        for r in rows:
            if r[ts_col].strip():
                events.append(_event(r[case_col], r[act_col], parse_ts(r[ts_col], fmt), r, actor_col, payload(r)))
    else:
        stamps = present(mapping.get("timestamps", {}), "timestamp")
        if not stamps:
            raise ValueError(f"{path.name}: mapping needs 'timestamps' (activity: column) or 'activity' + 'ts'")
        for r in rows:
            evs = sorted((parse_ts(r[c], fmt), a) for a, c in stamps.items() if r[c] and r[c].strip())
            for i, (ts, activity) in enumerate(evs):
                events.append(_event(r[case_col], activity, ts, r, actor_col, payload(r) if i == 0 else {}))
    return events


def _event(case_id, activity, ts, row, actor_col, payload) -> dict:
    return {
        "case_id": str(case_id).strip(),
        "activity": activity.strip(),
        "ts": ts,
        "actor": row[actor_col] if actor_col else None,
        "payload": payload,
    }
