"""Source adapters. Each one turns an export into events:
{case_id, activity, ts, actor, payload}. The payload holds the case's text fields and is
attached to the case's first event only.
"""

from pathlib import Path

from . import mbox, tabular

# Column names below are the usual export headers; override any of them in evenpoint.yaml.
DEFAULT_MAPPINGS = {
    "csv": {},
    "zendesk": {
        "case_id": "Id",
        "actor": "Assignee",
        "timestamps": {"created": "Created at", "assigned": "Assigned at", "solved": "Solved at"},
        "fields": {
            "subject": "Subject",
            "text": "Description",
            "group": "Group",
            "priority": "Priority",
            "type": "Type",
            "tags": "Tags",
        },
    },
    "jira": {
        "case_id": "Issue key",
        "actor": "Assignee",
        "timestamps": {"created": "Created", "resolved": "Resolved"},
        "fields": {
            "summary": "Summary",
            "text": "Description",
            "issue_type": "Issue Type",
            "priority": "Priority",
            "component": "Component/s",
        },
        "ts_format": "%d/%b/%y %I:%M %p",
    },
    "mbox": {"team": []},
}


def read(adapter: str, path: Path, mapping: dict) -> list[dict]:
    merged = {**DEFAULT_MAPPINGS[adapter], **mapping}
    reader = mbox.read if adapter == "mbox" else tabular.read
    return reader(Path(path), merged)
