from datetime import datetime
from email.message import EmailMessage
import mailbox

import pytest

from evenpoint import adapters
from evenpoint.redact import names_pattern, pseudonymize, redact_events, redact_text


def test_redact_text():
    text = (
        "Mail jo@example.com or call +1 (415) 555-0134. Card 4111 1111 1111 1111, "
        "IBAN DE89 3704 0044 0532 0130 00. Link https://x.io/r?token=abc123&a=1. "
        "Order on 2026-01-02 10:00 for 3 items."
    )
    out = redact_text(text)
    for secret in ("jo@example.com", "555-0134", "4111", "DE89", "abc123"):
        assert secret not in out
    assert "2026-01-02 10:00" in out  # dates survive
    assert "a=1" in out


def test_names_and_pseudonyms():
    events = [{"actor": "Ana Silva", "payload": {"text": "Thanks, ana here"}}]
    out = redact_events(events, salt="p")[0]
    assert out["actor"] == pseudonymize("ana silva", "p")
    assert out["payload"]["text"] == "Thanks, [NAME] here"
    assert names_pattern(set()) is None


def test_zendesk_wide_csv(tmp_path):
    p = tmp_path / "t.csv"
    p.write_text(
        "Id,Subject,Description,Group,Assignee,Created at,Assigned at,Solved at\n"
        "1,Refund,I want a refund,Billing,Ana,2026-01-01 10:00:00 +0000,2026-01-01 11:00:00 +0000,2026-01-02 09:00:00 +0000\n"
        "2,Login,Can't log in,Account,Ben,2026-01-03 10:00:00 +0000,,\n"
    )
    events = adapters.read("zendesk", p, {})
    assert [(e["case_id"], e["activity"]) for e in events] == [
        ("1", "created"), ("1", "assigned"), ("1", "solved"), ("2", "created")]
    assert events[0]["payload"] == {"subject": "Refund", "text": "I want a refund", "group": "Billing"}
    assert events[1]["payload"] == {}
    assert events[0]["ts"] == datetime(2026, 1, 1, 10)


def test_long_csv_and_errors(tmp_path):
    p = tmp_path / "e.csv"
    p.write_text("case,step,at,who\nA,open,2026-01-01T10:00:00Z,x\nA,close,2026-01-01T12:00:00Z,y\n")
    events = adapters.read("csv", p, {"case_id": "case", "activity": "step", "ts": "at", "actor": "who"})
    assert [e["activity"] for e in events] == ["open", "close"]
    with pytest.raises(ValueError, match="not found"):
        adapters.read("csv", p, {"case_id": "nope", "activity": "step", "ts": "at"})


def test_mbox_threads(tmp_path):
    box = mailbox.mbox(tmp_path / "m.mbox")
    for mid, sender, date, refs, body in [
        ("<a@x>", "cust@gmail.com", "Mon, 05 Jan 2026 10:00:00 +0000", None, "Where is my order?"),
        ("<b@x>", "help@acme.com", "Mon, 05 Jan 2026 11:00:00 +0000", "<a@x>", "It ships today."),
    ]:
        m = EmailMessage()
        m["From"], m["Date"], m["Message-ID"], m["Subject"] = sender, date, mid, "Order"
        if refs:
            m["In-Reply-To"] = m["References"] = refs
        m.set_content(body)
        box.add(m)
    box.flush()
    events = adapters.read("mbox", tmp_path / "m.mbox", {"team": ["@acme.com"]})
    assert [e["activity"] for e in events] == ["customer_message", "team_reply"]
    assert {e["case_id"] for e in events} == {"<a@x>"}
    assert events[0]["payload"]["text"] == "Where is my order?"
    assert events[0]["payload"]["reply"] == "It ships today."
