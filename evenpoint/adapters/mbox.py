"""Email adapter. A thread is a case; each message is an event.

Activities are `customer_message` and `team_reply`, told apart by the `team` mapping
(full addresses or @domains). The first customer message and first team reply become
the case's `text` and `reply` fields.
"""

import email.utils
import mailbox
from datetime import timezone
from email.header import decode_header, make_header
from pathlib import Path


def _body(msg) -> str:
    for part in msg.walk():
        if part.get_content_type() == "text/plain" and part.get_content_disposition() != "attachment":
            data = part.get_payload(decode=True) or b""
            return data.decode(part.get_content_charset() or "utf-8", "replace").strip()
    return ""


def _thread_root(msg) -> str:
    # ponytail: References[0] / In-Reply-To is enough for most clients; full JWZ threading if threads split.
    refs = (msg["References"] or "").split()
    return refs[0] if refs else (msg["In-Reply-To"] or msg["Message-ID"] or "").strip()


def read(path: Path, mapping: dict) -> list[dict]:
    team = [t.lower() for t in mapping.get("team", [])]
    if not team:
        raise ValueError("mbox mapping needs 'team': a list of addresses or @domains that send replies")

    threads: dict[str, list[dict]] = {}
    for msg in mailbox.mbox(path):
        if not msg["Date"]:
            continue
        sender = email.utils.parseaddr(msg["From"] or "")[1].lower()
        is_team = any(sender.endswith(t) if t.startswith("@") else sender == t for t in team)
        ts = email.utils.parsedate_to_datetime(msg["Date"])
        if ts.tzinfo:
            ts = ts.astimezone(timezone.utc).replace(tzinfo=None)
        threads.setdefault(_thread_root(msg), []).append({
            "activity": "team_reply" if is_team else "customer_message",
            "ts": ts,
            "actor": sender,
            "subject": str(make_header(decode_header(msg["Subject"] or ""))),
            "body": _body(msg),
        })

    events = []
    for root, msgs in threads.items():
        msgs.sort(key=lambda m: m["ts"])
        first_in = next((m for m in msgs if m["activity"] == "customer_message"), None)
        first_out = next((m for m in msgs if m["activity"] == "team_reply"), None)
        payload = {"subject": msgs[0]["subject"]}
        if first_in:
            payload["text"] = first_in["body"]
        if first_out:
            payload["reply"] = first_out["body"]
        for i, m in enumerate(msgs):
            events.append({
                "case_id": root,
                "activity": m["activity"],
                "ts": m["ts"],
                "actor": m["actor"],
                "payload": payload if i == 0 else {},
            })
    return events
