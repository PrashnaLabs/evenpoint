"""Generate the synthetic support-triage workflow (Zendesk-style ticket export).

All data is made up. Re-run to regenerate tickets.csv: python bizbench/support-triage/generate.py
"""

import csv
import random
from datetime import datetime, timedelta
from pathlib import Path

ITEMS = ["rain jacket", "trail shoes", "backpack", "wool socks", "water bottle", "tent"]
AGENTS = ["Ana Silva", "Ben Okafor", "Chen Wei", "Dana Novak"]

TOPICS = {
    "Billing": [
        ("Charged twice", "Hi, I was charged twice for order #{order}. Can you refund the second charge? My card ends in 4242.",
         "Sorry about that. I've refunded the duplicate charge for order #{order}; it shows on your statement in 3-5 business days."),
        ("Invoice request", "Could you send me an invoice for order #{order}? I need it for my company expenses.",
         "Here is the invoice for order #{order}, attached as a PDF. Let us know if the billing address needs changing."),
        ("Price went up", "Why was I charged more for my subscription this month? It used to be $12.",
         "The plan price changed on the 1st, as announced by email last month. You can switch to yearly billing to keep the old rate."),
    ],
    "Shipping": [
        ("Where is my order", "Where is order #{order}? It was supposed to arrive on {day} and tracking hasn't moved.",
         "Order #{order} is delayed at the carrier's hub. It should arrive within 2 business days; here's the updated tracking link."),
        ("Change address", "Can I change the delivery address for order #{order}? I'm moving this week. Call me on +1 415 555 01{n2}.",
         "Done: order #{order} will ship to your new address. You'll get a new tracking email when it leaves the warehouse."),
        ("Damaged package", "My {item} arrived with a big tear. Order #{order}. What can I do?",
         "Sorry the {item} arrived damaged. We're sending a replacement today at no cost; no need to return the damaged one."),
    ],
    "Returns": [
        ("Return request", "The {item} from order #{order} doesn't fit. How do I return it?",
         "You can return the {item} within 30 days. I've emailed you a prepaid return label for order #{order}."),
        ("Refund status", "I sent back my {item} two weeks ago and haven't seen a refund yet.",
         "We received your {item} and processed the refund today. It takes 3-5 business days to show on your card."),
        ("Exchange size", "Can I exchange my {item} for a larger size instead of returning it?",
         "Yes. I've set up an exchange for a larger {item}; use the prepaid label in your email to send the original back."),
    ],
    "Account": [
        ("Can't log in", "I can't log in and the password reset email never arrives. My email is {email}.",
         "I've sent a new reset link and whitelisted your address. Please check spam if it isn't in your inbox within 10 minutes."),
        ("Delete account", "Please delete my account and all my data.",
         "Your account deletion request is confirmed. All personal data will be removed within 30 days, as described in our privacy policy."),
        ("Update email", "Please change the email on my account to {email}.",
         "Your account email is now updated. You'll get a confirmation at the new address."),
    ],
    "Product": [
        ("Colors", "Does the {item} come in other colors?",
         "The {item} comes in black, olive and navy. Olive is low in stock in some sizes."),
        ("Washing", "How should I wash the {item}?",
         "Machine wash the {item} cold on a gentle cycle and hang dry. Avoid fabric softener."),
        ("Warranty", "My {item} broke after 8 months. Is it under warranty?",
         "Yes, the {item} has a 2-year warranty. Reply with a photo of the damage and we'll send a replacement."),
    ],
}


def main(n: int = 240, seed: int = 7) -> None:
    rng = random.Random(seed)
    start = datetime(2026, 7, 1, 8)
    rows = []
    for i in range(n):
        group = rng.choices(list(TOPICS), weights=[25, 30, 20, 15, 10])[0]
        subject, body, reply = rng.choice(TOPICS[group])
        vals = dict(order=rng.randint(10000, 99999), item=rng.choice(ITEMS), n2=f"{rng.randint(0, 99):02d}",
                    day=(start + timedelta(days=rng.randint(0, 90))).strftime("%B %d"),
                    email=f"customer{rng.randint(100, 999)}@example.com")
        created = start + timedelta(days=rng.uniform(0, 90), hours=rng.uniform(0, 10))
        assigned = created + timedelta(minutes=rng.uniform(5, 120))
        solved = assigned + timedelta(hours=rng.uniform(0.5, 30)) if rng.random() > 0.08 else None
        agent = rng.choice(AGENTS)
        fmt = "%Y-%m-%d %H:%M:%S +0000"
        rows.append({
            "Id": 5000 + i,
            "Subject": subject,
            "Description": body.format(**vals),
            "Group": group,
            "Priority": rng.choices(["Low", "Normal", "High", "Urgent"], weights=[20, 55, 20, 5])[0],
            "Tags": group.lower(),
            "Assignee": agent,
            "Created at": created.strftime(fmt),
            "Assigned at": assigned.strftime(fmt),
            "Solved at": solved.strftime(fmt) if solved else "",
            "Public reply": f"Hi, {agent.split()[0]} here. " + reply.format(**vals) if solved else "",
        })
    out = Path(__file__).parent / "tickets.csv"
    with open(out, "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0]))
        w.writeheader()
        w.writerows(rows)
    print(f"wrote {len(rows)} tickets to {out}")


if __name__ == "__main__":
    main()
