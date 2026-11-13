"""PII redaction. Runs at ingest, before anything is written to DuckDB or sent to a model.

Regex-based: it catches common patterns and will miss things (customer names in free text,
addresses). Use local models for sensitive data.
"""

import hashlib
import re

URL_SECRET = re.compile(
    r"(https?://\S+?[?&](?:token|key|sig|signature|code|auth|session|password)[^=\s&]*=)[^&\s]+", re.I
)
EMAIL = re.compile(r"[\w.+-]+@[\w-]+(?:\.[\w-]+)+")
IBAN = re.compile(r"\b[A-Z]{2}\d{2}(?: ?[A-Z0-9]{4}){2,7}(?: ?[A-Z0-9]{1,4})?\b")
CARD = re.compile(r"\b(?:\d[ -]?){12,18}\d\b")
PHONE = re.compile(r"(?<![\w-])(?!\d{4}-\d\d-\d\d)\+?\d[\d ().-]{6,}\d(?![\w-])")


def _phone(m: re.Match) -> str:
    # ISO dates are skipped by the pattern; other short digit runs (times, amounts) have <9 digits.
    digits = sum(c.isdigit() for c in m.group())
    return "[PHONE]" if 9 <= digits <= 15 else m.group()


def redact_text(text: str, names: re.Pattern | None = None) -> str:
    text = URL_SECRET.sub(r"\1[SECRET]", text)
    text = EMAIL.sub("[EMAIL]", text)
    text = IBAN.sub("[IBAN]", text)
    text = CARD.sub("[CARD]", text)
    text = PHONE.sub(_phone, text)
    if names:
        text = names.sub("[NAME]", text)
    return text


def pseudonymize(actor: str | None, salt: str) -> str | None:
    if not actor or not actor.strip():
        return None
    return "actor_" + hashlib.sha256(f"{salt}:{actor.strip().lower()}".encode()).hexdigest()[:8]


def names_pattern(actors: set[str]) -> re.Pattern | None:
    """Actor names (staff) also get scrubbed from free text, along with each word of 3+ letters in them."""
    words = {a.strip() for a in actors if a and len(a.strip()) >= 3}
    words |= {w for a in words if "@" not in a for w in a.split() if len(w) >= 3}
    if not words:
        return None
    alts = "|".join(re.escape(w) for w in sorted(words, key=len, reverse=True))
    return re.compile(rf"\b(?:{alts})\b", re.I)


def redact_events(events: list[dict], salt: str) -> list[dict]:
    names = names_pattern({e["actor"] for e in events if e.get("actor")})
    for e in events:
        e["actor"] = pseudonymize(e.get("actor"), salt)
        e["payload"] = {
            k: redact_text(v, names) if isinstance(v, str) else v for k, v in e.get("payload", {}).items()
        }
    return events
