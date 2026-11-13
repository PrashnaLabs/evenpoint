"""The only module that talks to model providers (through LiteLLM). Tests replace `complete`."""

import json
import re
import time
from dataclasses import dataclass
from datetime import datetime


@dataclass
class Reply:
    text: str
    input_tokens: int = 0
    output_tokens: int = 0
    cost_usd: float = 0.0
    latency_ms: int = 0
    error: str | None = None


def complete(model: str, prompt: str, max_tokens: int | None = None) -> Reply:
    import litellm  # slow import; keep the CLI's --help fast

    start = time.perf_counter()
    try:
        r = litellm.completion(
            model=model, messages=[{"role": "user", "content": prompt}], max_tokens=max_tokens, num_retries=3
        )
    except Exception as e:  # provider errors are recorded per call, not fatal
        return Reply("", latency_ms=_ms(start), error=f"{type(e).__name__}: {e}"[:500])
    try:
        cost = litellm.completion_cost(completion_response=r) or 0.0
    except Exception:
        cost = 0.0  # unknown price (e.g. local models)
    return Reply(
        text=r.choices[0].message.content or "",
        input_tokens=r.usage.prompt_tokens,
        output_tokens=r.usage.completion_tokens,
        cost_usd=cost,
        latency_ms=_ms(start),
    )


def _ms(start: float) -> int:
    return int((time.perf_counter() - start) * 1000)


def price(model: str) -> dict:
    import litellm

    p = litellm.model_cost.get(model) or litellm.model_cost.get(model.split("/", 1)[-1]) or {}
    return {k: v for k, v in p.items() if k in ("input_cost_per_token", "output_cost_per_token")}


def estimate_cost(model: str, prompt: str, output_tokens: int) -> float:
    p = price(model)
    input_tokens = len(prompt) / 4  # ponytail: chars/4 is close enough for a go/no-go estimate
    return input_tokens * p.get("input_cost_per_token", 0) + output_tokens * p.get("output_cost_per_token", 0)


def pricing_snapshot(models: list[str]) -> dict:
    return {m: price(m) for m in models}


def parse_json(text: str) -> dict | None:
    """Pull the first JSON object out of a model reply (models often wrap it in prose or fences)."""
    m = re.search(r"\{.*\}", text, re.S)
    if not m:
        return None
    try:
        return json.loads(m.group())
    except json.JSONDecodeError:
        return None


def log_row(run_id: str, kind: str, task_id: str, model: str, prompt: str, reply: Reply) -> dict:
    return {
        "run_id": run_id,
        "kind": kind,
        "task_id": task_id,
        "model": model,
        "prompt": prompt,
        "output": reply.text,
        "input_tokens": reply.input_tokens,
        "output_tokens": reply.output_tokens,
        "cost_usd": reply.cost_usd,
        "latency_ms": reply.latency_ms,
        "error": reply.error,
        "created_at": datetime.now(),
    }
