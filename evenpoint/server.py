"""Local web UI: a JSON API over the pipeline plus the built Astro app (evenpoint/web_dist).

Binds to 127.0.0.1 only. Requests must name localhost as Host (blocks DNS rebinding) and every
write needs the `X-Evenpoint: 1` header, which a cross-site form or image tag cannot send.
"""

import csv
import json
import mimetypes
import os
import re
import shutil
import threading
import time
import traceback
from datetime import date, datetime
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, unquote, urlparse

import yaml
from dotenv import load_dotenv, set_key

from . import __version__, adapters, db, llm, pipeline
from .adapters.tabular import parse_ts
from .bench import graders
from .config import Config
from .report import render

WEB_DIST = Path(__file__).parent / "web_dist"
BIZBENCH = Path(__file__).parent.parent / "bizbench"  # present in a source checkout
EXAMPLES = {
    "github-issue-triage": ("Real GitHub issues", "544 real issues from the uv project's tracker, with the labels "
                            "and first replies its maintainers actually wrote."),
    "support-triage": ("Synthetic support tickets", "240 made-up tickets for a small shop. Quick to run."),
}
NAME = re.compile(r"^[a-z0-9][a-z0-9_-]{0,63}$")
MAX_UPLOAD = 1024 * 1024 * 1024
OPENAI_MODELS = {
    "openai/gpt-5.4-nano": "Fastest and cheapest. Good for sorting and routing.",
    "openai/gpt-5.4-mini": "Balanced cost and quality. A sensible default.",
    "openai/gpt-5.4": "Stronger reasoning and writing. Costs more per ticket.",
    "openai/gpt-5.5": "The most capable. Use to see the ceiling.",
}

DEFAULT_CONFIG = {
    "project": "",
    "hourly_rate": 35,
    "sources": [],
    "steps": {},
    "models": ["openai/gpt-5.4-mini", "openai/gpt-5.4-nano"],
    "labeler_model": "openai/gpt-5.4-mini",
    "judge_model": "openai/gpt-5.4",
    "bench": {"tasks_per_candidate": 50, "max_cost_usd": 5},
    "review_minutes": {"auto": 0, "draft_review": 1.5},
    "failure_minutes": 10,
    "setup_cost_usd": 2000,
    "min_volume_per_month": 20,
    "max_candidates": 5,
}


class ApiError(Exception):
    def __init__(self, status: int, message: str):
        super().__init__(message)
        self.status = status


# ---------------------------------------------------------------- jobs

class Job:
    """One pipeline run in a background thread. Only one runs at a time."""

    def __init__(self, project: str, kind: str):
        self.project, self.kind = project, kind
        self.state = "running"  # running | confirm | done | error | cancelled
        self.stage: str | None = None
        self.log: list[str] = []
        self.progress: dict | None = None
        self.estimate: float | None = None
        self.limit: float | None = None
        self.error: str | None = None
        self.started, self.finished = time.time(), None
        self.cancelled = False
        self._decided = threading.Event()
        self._approved = False

    def json(self) -> dict:
        return {k: getattr(self, k) for k in ("project", "kind", "state", "stage", "log", "progress", "estimate",
                                                "limit", "error", "started", "finished")}

    # pipeline callbacks
    def on_log(self, line: str) -> None:
        self.log.append(line)

    def on_stage(self, stage: str) -> None:
        self._check()
        self.stage = stage

    def on_progress(self, done: int, total: int) -> None:
        self.progress = {"done": done, "total": total}
        self._check()

    def confirm(self, estimate: float, limit: float) -> None:
        self.estimate, self.limit = estimate, limit
        self.log.append(f"Estimated model cost: ${estimate:,.2f} (limit ${limit:,.2f})")
        if estimate > limit:
            self.state = "confirm"
            self._decided.wait()
            self._check()
            if not self._approved:
                raise pipeline.Cancelled()
            self.state = "running"

    def decide(self, approved: bool) -> None:
        self._approved = approved
        self._decided.set()

    def cancel(self) -> None:
        self.cancelled = True
        self._decided.set()

    def _check(self) -> None:
        if self.cancelled:
            raise pipeline.Cancelled()


_job: Job | None = None
_job_lock = threading.Lock()


def start_job(project: str, kind: str, work) -> Job:
    global _job
    with _job_lock:
        if _job and _job.state in ("running", "confirm"):
            raise ApiError(409, f"A run is already in progress for {_job.project}.")
        job = _job = Job(project, kind)

    def target():
        try:
            work(job)
            job.state = "done"
        except pipeline.Cancelled:
            job.state = "cancelled"
            job.log.append("Stopped.")
        except SystemExit as e:
            job.state, job.error = "error", str(e)
        except Exception as e:
            job.state, job.error = "error", f"{type(e).__name__}: {e}"
            job.log.append(traceback.format_exc(limit=3))
        finally:
            job.finished = time.time()

    threading.Thread(target=target, daemon=True).start()
    return job


# ---------------------------------------------------------------- projects

class Workspace:
    def __init__(self, root: Path):
        self.root = root
        root.mkdir(parents=True, exist_ok=True)

    def dir(self, name: str) -> Path:
        if not NAME.match(name or ""):
            raise ApiError(400, "Project names use lowercase letters, numbers, - and _.")
        d = self.root / name
        if not (d / "evenpoint.yaml").exists():
            raise ApiError(404, f"No project named {name}.")
        return d

    def raw_config(self, name: str) -> dict:
        return yaml.safe_load((self.dir(name) / "evenpoint.yaml").read_text()) or {}

    def config(self, name: str) -> Config:
        path = self.dir(name) / "evenpoint.yaml"
        try:
            cfg = Config.load(path)
        except SystemExit as e:
            raise ApiError(400, str(e)) from None
        except TypeError as e:
            raise ApiError(400, f"evenpoint.yaml has an unknown setting: {e}") from None
        load_dotenv(cfg.root / ".env")
        cfg.output_path.mkdir(parents=True, exist_ok=True)
        return cfg

    def list(self) -> list[dict]:
        out = []
        for d in sorted(self.root.iterdir()):
            if (d / "evenpoint.yaml").exists() and NAME.match(d.name):
                out.append(self.summary(d.name))
        return sorted(out, key=lambda p: p["updated"] or "", reverse=True)

    def summary(self, name: str) -> dict:
        d = self.dir(name)
        raw = self.raw_config(name)
        info = {"name": name, "sources": [Path(s.get("path", "")).name for s in raw.get("sources") or []],
                "models": raw.get("models") or [], "run": None,
                "updated": datetime.fromtimestamp((d / "evenpoint.yaml").stat().st_mtime).isoformat()}
        if (d / ".evenpoint" / "project.duckdb").exists():
            con = db.connect(d / ".evenpoint")
            try:
                row = con.execute("SELECT run_id, started_at FROM run_meta ORDER BY started_at DESC LIMIT 1").fetchone()
                if row:
                    best = con.execute(
                        """SELECT count(*) FILTER (WHERE verdict <> 'dont_automate'),
                                  coalesce(sum(net_hours_month) FILTER (WHERE verdict <> 'dont_automate'), 0),
                                  coalesce(sum(net_value_month) FILTER (WHERE verdict <> 'dont_automate'), 0),
                                  coalesce(sum(net_value_low) FILTER (WHERE verdict <> 'dont_automate'), 0)
                           FROM (SELECT *, row_number() OVER (PARTITION BY activity ORDER BY
                                   CASE verdict WHEN 'automate' THEN 0 WHEN 'review' THEN 1 ELSE 2 END,
                                   net_value_month DESC) AS rn
                                 FROM roi WHERE run_id = ?) WHERE rn = 1""", [row[0]]).fetchone()
                    cases = con.execute("SELECT count(DISTINCT case_id) FROM events WHERE run_id = ?",
                                        [row[0]]).fetchone()[0]
                    info["run"] = {"run_id": row[0], "started_at": row[1].isoformat(), "worth_automating": best[0],
                                   "hours": best[1], "value": best[2], "value_low": best[3], "cases": cases}
                    info["updated"] = max(info["updated"], row[1].isoformat())
            finally:
                con.close()
        return info


# ---------------------------------------------------------------- file inspection

def inspect_file(path: Path) -> dict:
    """Headers, preview rows and a suggested mapping for an uploaded export."""
    if path.suffix.lower() in (".mbox", ".mbx") or path.read_bytes()[:5] == b"From ":
        return {"file": path.name, "adapter": "mbox", "headers": [], "rows": [], "row_count": None,
                "mapping": {"team": []}}
    csv.field_size_limit(50_000_000)
    with open(path, newline="", encoding="utf-8-sig") as f:
        reader = csv.DictReader(f)
        headers = reader.fieldnames or []
        sample = []
        count = 0
        for row in reader:
            count += 1
            if len(sample) < 300:
                sample.append(row)
    if not headers:
        raise ApiError(400, "That file has no header row. Export it as CSV with column names.")

    def values(h):
        return [r[h] for r in sample if r.get(h) and r[h].strip()]

    def parses(h):
        vs = values(h)[:50]
        if not vs:
            return False
        ok = 0
        for v in vs:
            try:
                parse_ts(v)
                ok += 1
            except ValueError:
                pass
        return ok / len(vs) >= 0.8

    lower = {h.lower(): h for h in headers}
    adapter = "zendesk" if {"id", "created at"} <= set(lower) else "jira" if "issue key" in lower else "csv"
    timestamps = [h for h in headers if parses(h)]
    case_id = next((h for h in headers if h.lower() in ("id", "ticket id", "issue key", "case id", "key")), None)
    if not case_id:
        case_id = next((h for h in headers if len(set(values(h))) == len(sample) and values(h)), headers[0])
    text_like, label_like = [], []
    for h in headers:
        if h in timestamps or h == case_id:
            continue
        vs = values(h)
        if not vs:
            continue
        avg = sum(map(len, vs)) / len(vs)
        distinct = len(set(vs))
        if avg > 40:
            text_like.append(h)
        elif 2 <= distinct <= 60 and distinct < len(vs) * 0.5:
            label_like.append(h)

    def slug(h):
        return re.sub(r"[^a-z0-9]+", "_", h.lower()).strip("_") or "field"

    if adapter == "csv":
        mapping = {"case_id": case_id,
                   "timestamps": {re.sub(r"_?(at|date|time)$", "", slug(h)) or slug(h): h for h in timestamps},
                   "fields": {slug(h): h for h in text_like + label_like}}
    else:
        mapping = adapters.DEFAULT_MAPPINGS[adapter]
    return {
        "file": path.name, "adapter": adapter, "headers": headers, "row_count": count,
        "rows": [{h: (r.get(h) or "")[:300] for h in headers} for r in sample[:5]],
        "timestamp_columns": timestamps, "text_columns": text_like, "label_columns": label_like,
        "mapping": mapping,
    }


# ---------------------------------------------------------------- results

def results(cfg: Config) -> dict:
    con = db.connect(cfg.project_dir)
    try:
        if not con.execute("SELECT count(*) FROM run_meta").fetchone()[0]:
            return {"run": None}
        run_id = db.latest_run(con)
        data = render.gather(con, run_id, cfg)
        data.pop("cfg")
        data["meta"].pop("config_yaml", None)
        data["assumptions"] = {
            "hourly_rate": cfg.hourly_rate, "review_auto": cfg.review_minutes.auto,
            "review_draft": cfg.review_minutes.draft_review, "failure_minutes": cfg.failure_minutes,
            "setup_cost_usd": cfg.setup_cost_usd, "tasks_per_candidate": cfg.bench.tasks_per_candidate,
            "judge_model": cfg.judge_model, "labeler_model": cfg.labeler_model,
            "min_volume_per_month": cfg.min_volume_per_month,
        }
        data["run"] = run_id
        data["report_exists"] = (cfg.output_path / "report.html").exists()
        return json.loads(json.dumps(data, default=_jsonable))
    finally:
        con.close()


def _jsonable(v):
    if isinstance(v, (datetime, date)):
        return v.isoformat()
    return str(v)


# ---------------------------------------------------------------- HTTP

class Handler(BaseHTTPRequestHandler):
    server_version = "evenpoint"
    ws: Workspace

    def log_message(self, fmt, *args):  # keep the terminal quiet
        pass

    def do_GET(self):
        self._dispatch("GET")

    def do_POST(self):
        self._dispatch("POST")

    def do_PUT(self):
        self._dispatch("PUT")

    def do_DELETE(self):
        self._dispatch("DELETE")

    def _dispatch(self, method: str):
        host = (self.headers.get("Host") or "").rsplit(":", 1)[0].strip("[]")
        if host not in ("127.0.0.1", "localhost", "::1"):
            return self._send(403, {"error": "Evenpoint only answers on localhost."})
        url = urlparse(self.path)
        if not url.path.startswith("/api/"):
            return self._static(url.path) if method == "GET" else self._send(405, {"error": "Not allowed."})
        if method != "GET" and self.headers.get("X-Evenpoint") != "1":
            return self._send(403, {"error": "Missing X-Evenpoint header."})
        try:
            parts = [unquote(p) for p in url.path.split("/")[2:] if p]
            result = self.route(method, parts, {k: v[0] for k, v in parse_qs(url.query).items()})
            if isinstance(result, tuple):  # (content_type, bytes, filename)
                return self._send_raw(200, *result)
            self._send(200, result)
        except ApiError as e:
            self._send(e.status, {"error": str(e)})
        except Exception as e:  # unexpected: report, don't crash the server
            traceback.print_exc()
            self._send(500, {"error": f"{type(e).__name__}: {e}"})

    def body(self) -> dict:
        n = int(self.headers.get("Content-Length") or 0)
        if not n:
            return {}
        try:
            data = json.loads(self.rfile.read(n))
        except json.JSONDecodeError:
            raise ApiError(400, "Request body is not valid JSON.") from None
        if not isinstance(data, dict):
            raise ApiError(400, "Request body must be a JSON object.")
        return data

    # routes ---------------------------------------------------------
    def route(self, method: str, parts: list[str], query: dict):
        ws = self.ws
        match (method, parts):
            case ("GET", ["status"]):
                return {"version": __version__, "workspace": str(ws.root), "openai_key": bool(os.environ.get(
                    "OPENAI_API_KEY")), "job": _job.json() if _job else None, "stages": db.STAGES,
                    "examples": [{"id": k, "title": t, "about": a} for k, (t, a) in EXAMPLES.items()
                                 if (BIZBENCH / k / "evenpoint.yaml").exists()],
                    "models": [{"id": m, "about": about, **{k: v * 1e6 for k, v in llm.price(m).items()}}
                               for m, about in OPENAI_MODELS.items()]}
            case ("POST", ["settings", "key"]):
                key = (self.body().get("openai_api_key") or "").strip()
                if not key.startswith("sk-") or len(key) < 20:
                    raise ApiError(400, "That doesn't look like an OpenAI API key (they start with sk-).")
                env = ws.root / ".env"
                env.touch(mode=0o600, exist_ok=True)
                set_key(str(env), "OPENAI_API_KEY", key)
                os.environ["OPENAI_API_KEY"] = key
                return {"openai_key": True}
            case ("GET", ["projects"]):
                return ws.list()
            case ("POST", ["projects"]):
                name = (self.body().get("name") or "").strip().lower()
                name = re.sub(r"[^a-z0-9_-]+", "-", name).strip("-")
                if not NAME.match(name):
                    raise ApiError(400, "Give the project a name using letters and numbers.")
                d = ws.root / name
                if d.exists():
                    raise ApiError(409, f"A project named {name} already exists.")
                (d / "exports").mkdir(parents=True)
                (d / "evenpoint.yaml").write_text(yaml.safe_dump({**DEFAULT_CONFIG, "project": name},
                                                                 sort_keys=False))
                return ws.summary(name)
            case ("POST", ["projects", "sample"]):
                example = self.body().get("example") or "github-issue-triage"
                src = BIZBENCH / example
                if example not in EXAMPLES or not (src / "evenpoint.yaml").exists():
                    raise ApiError(404, "Example data ships with the source checkout only.")
                d = ws.root / f"example-{example}"
                if not d.exists():
                    (d / "exports").mkdir(parents=True)
                    cfg = yaml.safe_load((src / "evenpoint.yaml").read_text())
                    for s in cfg["sources"]:
                        f = (src / s["path"]).resolve()
                        shutil.copy(f, d / "exports" / f.name)
                        s["path"] = f"exports/{f.name}"
                    cfg["project"] = d.name
                    (d / "evenpoint.yaml").write_text(yaml.safe_dump(cfg, sort_keys=False, allow_unicode=True))
                    for done in (".evenpoint", "output"):  # finished results, when this checkout has them
                        if (src / done).is_dir():
                            shutil.copytree(src / done, d / done)
                return ws.summary(d.name)
            case ("GET", ["projects", name]):
                d = ws.dir(name)
                files = sorted(p.name for p in (d / "exports").glob("*") if p.is_file()) if (
                    d / "exports").exists() else []
                return {**ws.summary(name), "config": ws.raw_config(name), "files": files}
            case ("PUT", ["projects", name, "config"]):
                d = ws.dir(name)
                cfg = self.body()
                cfg["project"] = name
                (d / "evenpoint.yaml").write_text(yaml.safe_dump(cfg, sort_keys=False, allow_unicode=True))
                return {"config": cfg}
            case ("DELETE", ["projects", name]):
                raise ApiError(405, "Delete projects from your file manager; Evenpoint never deletes data.")
            case ("POST", ["projects", name, "upload"]):
                return self.upload(name)
            case ("GET", ["projects", name, "inspect"]):
                f = ws.dir(name) / "exports" / Path(query.get("file", "")).name
                if not f.is_file():
                    raise ApiError(404, "File not found in this project's exports.")
                return inspect_file(f)
            case ("POST", ["projects", name, "run"]):
                stage = self.body().get("from_stage") or "ingest"
                if stage not in db.STAGES:
                    raise ApiError(400, f"Unknown stage {stage}.")
                cfg = ws.config(name)
                if not os.environ.get("OPENAI_API_KEY") and any(m.startswith("openai/") for m in cfg.models):
                    raise ApiError(400, "Add your OpenAI API key first (Settings).")

                def work(job):
                    con = db.connect(cfg.project_dir)
                    try:
                        if stage == "ingest":
                            run_id = pipeline.new_run(con, cfg)
                        else:
                            run_id = db.latest_run(con)
                            db.clear_from(con, run_id, stage)
                        job.on_log(f"run {run_id}")
                        pipeline.run_stages(con, run_id, cfg, stage, cfg.output_path / "report.html",
                                            log=job.on_log, confirm=job.confirm, on_stage=job.on_stage,
                                            progress=job.on_progress)
                    finally:
                        con.close()
                return start_job(name, "run", work).json()
            case ("POST", ["projects", name, "rerun"]):
                models = [m for m in self.body().get("models", []) if isinstance(m, str) and m.strip()]
                if not models:
                    raise ApiError(400, "Pick at least one model to add.")
                cfg = ws.config(name)

                def work(job):
                    con = db.connect(cfg.project_dir)
                    try:
                        pipeline.rerun(con, cfg, models, cfg.output_path / "report.html", confirm=job.confirm,
                                       log=job.on_log, on_stage=job.on_stage, progress=job.on_progress)
                    finally:
                        con.close()
                return start_job(name, "rerun", work).json()
            case ("GET", ["job"]):
                return _job.json() if _job else None
            case ("POST", ["job", "confirm"]):
                if not _job or _job.state != "confirm":
                    raise ApiError(409, "Nothing is waiting for confirmation.")
                _job.decide(bool(self.body().get("approve")))
                return _job.json()
            case ("POST", ["job", "cancel"]):
                if _job and _job.state in ("running", "confirm"):
                    _job.cancel()
                return _job.json() if _job else None
            case ("GET", ["projects", name, "results"]):
                return results(ws.config(name))
            case ("GET", ["projects", name, "report"]):
                f = ws.config(name).output_path / "report.html"
                if not f.exists():
                    raise ApiError(404, "No report yet. Run the analysis first.")
                return ("text/html; charset=utf-8", f.read_bytes(), f"{name}-report.html"
                        if query.get("download") else None)
            case ("GET", ["projects", name, "review"]):
                cfg = ws.config(name)
                con = db.connect(cfg.project_dir)
                try:
                    items = graders.review_items(con, db.latest_run(con), int(query.get("n", 10)), cfg.bench.seed)
                finally:
                    con.close()
                return json.loads(json.dumps(items, default=_jsonable))
            case ("POST", ["projects", name, "review"]):
                marks = [(g["task_id"], g["model"], bool(g["pass"])) for g in self.body().get("grades", [])
                         if isinstance(g, dict) and {"task_id", "model", "pass"} <= g.keys()]
                if not marks:
                    raise ApiError(400, "No grades to save.")
                cfg = ws.config(name)

                def work(job):
                    con = db.connect(cfg.project_dir)
                    try:
                        run_id = db.latest_run(con)
                        job.on_log(f"Saved {graders.save_human_grades(con, run_id, marks)} human grades")
                        pipeline.run_stages(con, run_id, cfg, "roi", cfg.output_path / "report.html",
                                            log=job.on_log, on_stage=job.on_stage)
                    finally:
                        con.close()
                return start_job(name, "review", work).json()
        raise ApiError(404, "Not found.")

    def upload(self, name: str) -> dict:
        d = self.ws.dir(name) / "exports"
        d.mkdir(exist_ok=True)
        filename = Path(unquote(self.headers.get("X-Filename") or "")).name
        filename = re.sub(r"[^\w.\- ]+", "_", filename).strip()
        if not filename or filename.startswith("."):
            raise ApiError(400, "Upload needs a file name.")
        n = int(self.headers.get("Content-Length") or 0)
        if not n:
            raise ApiError(400, "The file is empty.")
        if n > MAX_UPLOAD:
            raise ApiError(413, "Files over 1 GB aren't supported.")
        dest = d / filename
        with open(dest, "wb") as f:
            remaining = n
            while remaining:
                chunk = self.rfile.read(min(remaining, 1 << 20))
                if not chunk:
                    break
                f.write(chunk)
                remaining -= len(chunk)
        return inspect_file(dest)

    # responses ------------------------------------------------------
    def _send(self, status: int, data) -> None:
        body = json.dumps(data, default=_jsonable).encode()
        self._send_raw(status, "application/json", body, None)

    def _send_raw(self, status: int, ctype: str, body: bytes, filename: str | None) -> None:
        self.send_response(status)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Cache-Control", "no-store")
        if filename:
            self.send_header("Content-Disposition", f'attachment; filename="{filename}"')
        self.end_headers()
        self.wfile.write(body)

    def _static(self, path: str) -> None:
        if not WEB_DIST.exists():
            msg = b"Web UI not built. Run: cd web && npm install && npm run build"
            return self._send_raw(503, "text/plain; charset=utf-8", msg, None)
        f = (WEB_DIST / unquote(path).lstrip("/")).resolve()
        if not f.is_relative_to(WEB_DIST.resolve()):
            return self._send(404, {"error": "Not found."})
        if f.is_dir():
            f = f / "index.html"
        if not f.is_file():
            f = WEB_DIST / "404.html" if (WEB_DIST / "404.html").exists() else WEB_DIST / "index.html"
        ctype = mimetypes.guess_type(f.name)[0] or "application/octet-stream"
        if ctype.startswith("text/") or ctype in ("application/javascript", "image/svg+xml"):
            ctype += "; charset=utf-8"
        self.send_response(200)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(f.stat().st_size))
        self.send_header("X-Content-Type-Options", "nosniff")
        self.end_headers()
        self.wfile.write(f.read_bytes())


def serve(workspace: Path, port: int = 8765, open_browser: bool = True) -> None:
    ws = Workspace(workspace.resolve())
    load_dotenv(ws.root / ".env")
    load_dotenv(Path.cwd() / ".env")
    handler = type("BoundHandler", (Handler,), {"ws": ws})
    httpd = ThreadingHTTPServer(("127.0.0.1", port), handler)
    url = f"http://localhost:{port}/"
    print(f"Evenpoint UI on {url}  (projects in {ws.root}; Ctrl+C to stop)")
    if open_browser:
        import webbrowser

        threading.Timer(0.5, webbrowser.open, [url]).start()
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print()
