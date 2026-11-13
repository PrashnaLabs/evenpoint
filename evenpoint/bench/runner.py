"""Run every test case on every model. Results are written as they arrive, so an interrupted
run resumes where it stopped: (task, model) pairs already in `runs` are skipped."""

from concurrent.futures import ThreadPoolExecutor, as_completed

from .. import db, llm
from .tasks import OUTPUT_TOKENS


def run(con, run_id: str, models: list[str], workers: int, progress=None, log=print) -> tuple[int, int, str | None]:
    """Returns (calls made, calls failed, first error). `progress(done, total)` may raise to cancel."""
    tasks = con.execute("SELECT task_id, task_type, prompt FROM tasks WHERE run_id = ?", [run_id]).fetchall()
    done = set(con.execute("SELECT task_id, model FROM runs WHERE run_id = ? AND kind = 'task'", [run_id]).fetchall())
    todo = [(tid, ttype, prompt, m) for tid, ttype, prompt in tasks for m in models if (tid, m) not in done]

    failed, first_error = 0, None
    ex = ThreadPoolExecutor(workers)
    try:
        futures = {
            ex.submit(llm.complete, m, prompt, OUTPUT_TOKENS[ttype] * 2): (tid, m, prompt)
            for tid, ttype, prompt, m in todo
        }
        for i, f in enumerate(as_completed(futures), 1):
            tid, m, prompt = futures[f]
            reply = f.result()
            db.insert(con, "runs", [llm.log_row(run_id, "task", tid, m, prompt, reply)])
            if reply.error:
                failed += 1
                first_error = first_error or f"{m}: {reply.error}"
            if progress:
                progress(i, len(todo))
            if i % 25 == 0 or i == len(todo):
                log(f"  {i}/{len(todo)} model calls done")
    finally:
        ex.shutdown(cancel_futures=True)  # on cancel, drop calls not yet started
    return len(todo), failed, first_error
