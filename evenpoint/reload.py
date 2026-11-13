"""`evenpoint ui --reload`: restart the server when Python code changes, rebuild the web UI when
web/ changes, and let open pages refresh themselves (they poll /api/dev/stamp).

ponytail: polls file mtimes every 0.5 s with the stdlib; switch to watchfiles if trees get large.
"""

import os
import shutil
import signal
import subprocess
import sys
import threading
import time
import webbrowser
from pathlib import Path

PKG = Path(__file__).parent
WEB = PKG.parent / "web"
WEB_INPUTS = ("src", "public", "astro.config.mjs")


def _snapshot(paths: list[Path], suffixes: tuple[str, ...]) -> dict[Path, float]:
    files: dict[Path, float] = {}
    for root in paths:
        if root.is_file():
            files[root] = root.stat().st_mtime
            continue
        for f in root.rglob("*"):
            if f.is_file() and f.suffix in suffixes and "__pycache__" not in f.parts:
                files[f] = f.stat().st_mtime
    return files


def _build_web() -> bool:
    npm = shutil.which("npm")
    if not npm or not (WEB / "package.json").exists():
        print("reload: web/ changed, but npm isn't available to rebuild the UI", file=sys.stderr, flush=True)
        return False
    if not (WEB / "node_modules").exists():
        subprocess.run([npm, "install", "--silent"], cwd=WEB)
    started = time.time()
    out = subprocess.run([npm, "run", "build", "--silent"], cwd=WEB, capture_output=True, text=True)
    if out.returncode:
        print(f"reload: UI build failed, keeping the previous build\n{out.stdout[-2000:]}{out.stderr[-2000:]}",
              file=sys.stderr, flush=True)
        return False
    print(f"reload: UI rebuilt in {time.time() - started:.1f}s", flush=True)
    return True


def run(argv: list[str], port: int, open_browser: bool) -> None:
    """Supervise `evenpoint ui` children; `argv` are the child's arguments (without --reload)."""
    # `kill` (SIGTERM) must stop the server child too, not orphan it on the port.
    signal.signal(signal.SIGTERM, lambda *_: sys.exit(0))
    env = {**os.environ, "EVENPOINT_RELOAD": "1"}
    cmd = [sys.executable, "-m", "evenpoint.cli", *argv, "--no-open"]
    py_watch = [PKG]
    web_watch = [WEB / p for p in WEB_INPUTS if (WEB / p).exists()]

    if web_watch and not (PKG / "web_dist").exists():
        _build_web()

    def start() -> subprocess.Popen:
        return subprocess.Popen(cmd, env=env)

    child = start()
    if open_browser:
        threading.Timer(1.0, webbrowser.open, [f"http://localhost:{port}/"]).start()
    py_seen = _snapshot(py_watch, (".py", ".j2"))
    web_seen = _snapshot(web_watch, (".astro", ".ts", ".css", ".js", ".mjs", ".svg", ".json"))
    print("reload: watching evenpoint/ and web/ for changes", flush=True)
    try:
        while True:
            time.sleep(0.5)
            now_py = _snapshot(py_watch, (".py", ".j2"))
            if now_py != py_seen:
                py_seen = now_py
                time.sleep(0.2)  # let editors finish writing
                print("reload: Python changed, restarting server (a run in progress is stopped)", flush=True)
                child.terminate()
                try:
                    child.wait(5)
                except subprocess.TimeoutExpired:
                    child.kill()
                child = start()
            now_web = _snapshot(web_watch, (".astro", ".ts", ".css", ".js", ".mjs", ".svg", ".json"))
            if now_web != web_seen:
                web_seen = now_web
                time.sleep(0.2)
                _build_web()
                web_seen = _snapshot(web_watch, (".astro", ".ts", ".css", ".js", ".mjs", ".svg", ".json"))
    except KeyboardInterrupt:
        pass
    finally:
        child.terminate()
        try:
            child.wait(5)
        except subprocess.TimeoutExpired:
            child.kill()
        print(flush=True)
