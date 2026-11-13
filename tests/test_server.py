"""The web UI's API, end to end over HTTP, with a fake model."""

import json
import shutil
import threading
import time
import urllib.request
from http.server import ThreadingHTTPServer
from pathlib import Path

import pytest

from evenpoint import llm, server

from test_pipeline import BIZBENCH, fake_complete


@pytest.fixture
def api(tmp_path, monkeypatch):
    monkeypatch.setattr(llm, "complete", fake_complete)
    monkeypatch.setenv("OPENAI_API_KEY", "sk-test-not-a-real-key-000")
    handler = type("H", (server.Handler,), {"ws": server.Workspace(tmp_path)})
    httpd = ThreadingHTTPServer(("127.0.0.1", 0), handler)
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    base = f"http://127.0.0.1:{httpd.server_port}/api"

    def call(method, path, body=None, headers=None, raw=None):
        data = raw if raw is not None else (json.dumps(body).encode() if body is not None else None)
        req = urllib.request.Request(base + path, data=data, method=method,
                                     headers={"X-Evenpoint": "1", **(headers or {})})
        try:
            with urllib.request.urlopen(req) as r:
                return r.status, json.loads(r.read())
        except urllib.error.HTTPError as e:
            return e.code, json.loads(e.read())

    yield call
    httpd.shutdown()


def wait_job(call):
    for _ in range(200):
        _, job = call("GET", "/job")
        if job["state"] not in ("running",):
            return job
        time.sleep(0.05)
    raise AssertionError("job did not finish")


def test_ui_api_flow(api):
    status, p = api("POST", "/projects", {"name": "Support Q3"})
    assert status == 200 and p["name"] == "support-q3"
    assert api("POST", "/projects", {"name": "support-q3"})[0] == 409

    csv_bytes = (BIZBENCH / "tickets.csv").read_bytes()
    status, info = api("POST", "/projects/support-q3/upload", raw=csv_bytes, headers={"X-Filename": "../tickets.csv"})
    assert status == 200 and info["adapter"] == "zendesk" and info["file"] == "tickets.csv"
    assert "Created at" in info["timestamp_columns"] and info["row_count"] == 240

    _, proj = api("GET", "/projects/support-q3")
    cfg = proj["config"]
    yml = (BIZBENCH / "evenpoint.yaml").read_text()
    import yaml
    bench_cfg = yaml.safe_load(yml)
    cfg.update(sources=[{"adapter": "zendesk", "path": "exports/tickets.csv", "mapping": bench_cfg["sources"][0]["mapping"]}],
               steps=bench_cfg["steps"], bench={"tasks_per_candidate": 20, "max_cost_usd": 0.0001},
               min_volume_per_month=10)
    assert api("PUT", "/projects/support-q3/config", cfg)[0] == 200

    # Over the cost limit: the job waits for confirmation.
    assert api("POST", "/projects/support-q3/run", {})[0] == 200
    job = wait_job(api)
    assert job["state"] == "confirm" and job["estimate"] > job["limit"]
    assert api("POST", "/projects/support-q3/run", {})[0] == 409  # one run at a time
    api("POST", "/job/confirm", {"approve": True})
    job = wait_job(api)
    assert job["state"] == "done", job

    _, res = api("GET", "/projects/support-q3/results")
    assert res["run"] and res["best"] and res["summaries"] and res["assumptions"]["hourly_rate"] == 35

    _, items = api("GET", "/projects/support-q3/review?n=2")
    assert len(items) == 4 and {"input", "expected", "output", "auto_pass"} <= items[0].keys()
    grades = [{"task_id": i["task_id"], "model": i["model"], "pass": False} for i in items]
    assert api("POST", "/projects/support-q3/review", {"grades": grades})[0] == 200
    assert wait_job(api)["state"] == "done"

    _, listing = api("GET", "/projects")
    assert listing[0]["run"]["cases"] == 240


def test_api_guards(api):
    assert api("POST", "/projects", {"name": "x"}, headers={"X-Evenpoint": "0"})[0] == 403
    assert api("GET", "/projects/..%2Fetc")[0] == 400
    assert api("GET", "/projects/nope")[0] == 404
    assert api("GET", "/status", headers={"Host": "evil.example"})[0] == 403  # DNS rebinding
