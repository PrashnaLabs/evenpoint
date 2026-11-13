"""Load evenpoint.yaml into dataclasses."""

from dataclasses import dataclass, field
from pathlib import Path

import yaml

ADAPTERS = ("csv", "zendesk", "jira", "mbox")
TASK_TYPES = ("classify", "extract", "draft")
MODES = ("auto", "draft_review")


@dataclass
class SourceConfig:
    adapter: str
    path: Path
    mapping: dict = field(default_factory=dict)


@dataclass
class StepOverride:
    """Per-step overrides. Anything left as None is taken from the data or the labeler."""

    minutes: float | None = None
    task_type: str | None = None
    input: str | None = None
    expected: str | None = None


@dataclass
class BenchConfig:
    tasks_per_candidate: int = 50
    few_shot: int = 3
    max_cost_usd: float = 10.0
    seed: int = 42
    workers: int = 4


@dataclass
class ReviewMinutes:
    auto: float = 0.0
    draft_review: float = 1.5

    def for_mode(self, mode: str) -> float:
        return getattr(self, mode)


@dataclass
class Config:
    project: str
    sources: list[SourceConfig]
    models: list[str]
    labeler_model: str
    judge_model: str
    hourly_rate: float = 35.0
    steps: dict[str, StepOverride] = field(default_factory=dict)
    bench: BenchConfig = field(default_factory=BenchConfig)
    review_minutes: ReviewMinutes = field(default_factory=ReviewMinutes)
    failure_minutes: float = 10.0
    setup_cost_usd: float = 0.0
    min_volume_per_month: float = 20.0
    max_candidates: int = 5
    output_dir: str = "output"  # report and review CSVs, relative to evenpoint.yaml
    root: Path = Path(".")
    raw: str = ""

    @staticmethod
    def load(path: str | Path) -> "Config":
        path = Path(path)
        if not path.exists():
            raise SystemExit(f"{path} not found. Create one with: evenpoint init <export>")
        raw = path.read_text()
        data = yaml.safe_load(raw) or {}
        root = path.resolve().parent

        missing = [k for k in ("project", "sources", "models", "labeler_model", "judge_model") if not data.get(k)]
        if missing:
            raise SystemExit(f"{path}: missing required keys: {', '.join(missing)}")

        sources = []
        for s in data.pop("sources"):
            if s.get("adapter") not in ADAPTERS:
                raise SystemExit(f"{path}: adapter must be one of {ADAPTERS}, got {s.get('adapter')!r}")
            sources.append(SourceConfig(s["adapter"], root / s["path"], s.get("mapping") or {}))

        steps = {}
        for name, o in (data.pop("steps", None) or {}).items():
            o = StepOverride(**(o or {}))
            if o.task_type and o.task_type not in TASK_TYPES:
                raise SystemExit(f"{path}: steps.{name}.task_type must be one of {TASK_TYPES}")
            steps[name] = o

        return Config(
            sources=sources,
            steps=steps,
            bench=BenchConfig(**(data.pop("bench", None) or {})),
            review_minutes=ReviewMinutes(**(data.pop("review_minutes", None) or {})),
            root=root,
            raw=raw,
            **data,
        )

    @property
    def project_dir(self) -> Path:
        return self.root / ".evenpoint"

    @property
    def output_path(self) -> Path:
        return self.root / self.output_dir
