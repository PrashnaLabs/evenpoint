"""Build a real-data example: issue triage on a public GitHub repo (default astral-sh/uv).

Every row is a real issue (all issues opened in the window, so volumes are real) with real timestamps
and, where they happened, real human outputs:
- Type     : the type label a maintainer applied (bug / enhancement / question / documentation)
- Reply    : the first reply a maintainer wrote
- Triaged at / First response at / Closed at : when those actually happened (from the issue timeline)

Needs the GitHub CLI, logged in (`gh auth login`); about one API call per issue.

  python bizbench/github-issue-triage/fetch.py [--repo astral-sh/uv] [--since 2026-05-01] [--until 2026-10-31]
"""

import argparse
import csv
import json
import subprocess
import sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

TYPES = ["bug", "enhancement", "question", "documentation"]  # priority order if several are applied
STAFF = {"OWNER", "MEMBER", "COLLABORATOR"}


def gh(path: str) -> list | dict:
    out = subprocess.run(["gh", "api", "--paginate", "--slurp", path], capture_output=True, text=True)
    if out.returncode:
        sys.exit(f"gh api {path} failed: {out.stderr.strip()}")
    pages = json.loads(out.stdout)
    if pages and isinstance(pages[0], dict) and "items" in pages[0]:  # search API
        return [i for p in pages for i in p["items"]]
    return [i for p in pages for i in p] if pages and isinstance(pages[0], list) else pages


def issue_row(repo: str, issue: dict) -> dict:
    labels = {l["name"] for l in issue["labels"]}
    kind = next((t for t in TYPES if t in labels), "")
    triaged = first_reply = closed = None
    for ev in gh(f"repos/{repo}/issues/{issue['number']}/timeline?per_page=100"):
        e = ev.get("event")
        if e == "labeled" and not triaged and ev["label"]["name"] in TYPES:
            triaged = ev
        elif (e == "commented" and not first_reply and ev.get("author_association") in STAFF
              and ev["user"]["type"] != "Bot" and ev["user"]["login"] != issue["user"]["login"]):
            first_reply = ev
        elif e == "closed":
            closed = ev
    body = (issue.get("body") or "").strip()
    return {
        "Id": issue["number"],
        "Title": issue["title"],
        "Text": f"{issue['title']}\n\n{body}"[:6000],
        "Type": kind,
        "Reply": first_reply["body"].strip()[:6000] if first_reply else "",
        "Responder": first_reply["user"]["login"] if first_reply else "",
        "Opened at": issue["created_at"],
        "Triaged at": triaged["created_at"] if triaged else "",
        "First response at": first_reply["created_at"] if first_reply else "",
        "Closed at": closed["created_at"] if closed else "",
        "Closed as": issue.get("state_reason") or "",
        "Url": issue["html_url"],
    }


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("--repo", default="astral-sh/uv")
    p.add_argument("--since", default="2026-05-01")
    p.add_argument("--until", default="2026-10-31")
    p.add_argument("--out", default=str(Path(__file__).parent / "issues.csv"))
    a = p.parse_args()

    issues = gh(f"search/issues?q=repo:{a.repo}+is:issue+created:{a.since}..{a.until}&per_page=100&sort=created&order=asc")
    print(f"{len(issues)} issues created {a.since}..{a.until}; reading timelines…")
    with ThreadPoolExecutor(8) as ex:
        rows = list(ex.map(lambda i: issue_row(a.repo, i), issues))
    rows.sort(key=lambda r: r["Opened at"])
    with open(a.out, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0]))
        w.writeheader()
        w.writerows(rows)
    usable = sum(bool(r["Type"] and r["Reply"]) for r in rows)
    print(f"wrote {len(rows)} issues ({usable} with a type label and a maintainer reply) to {a.out}")


if __name__ == "__main__":
    main()
