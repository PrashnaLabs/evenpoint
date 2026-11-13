// Run tab: start a run, watch each stage, approve the spend, stop, or add models to the last run.
import { api, type Job } from "../lib/api";
import { $, $$, busy, html, icon, modelName, mount, raw, toast, usd, type Raw } from "../lib/ui";
import type { Ctx } from "./project";

const STAGES: { id: string; label: string; about: string }[] = [
  { id: "ingest", label: "Read and redact the export", about: "Builds the event log and removes personal details." },
  { id: "baseline", label: "Measure today's work", about: "Volume, time and handoffs for each step." },
  { id: "score", label: "Score steps for AI", about: "A model rates how repetitive, structured and risky each step is." },
  { id: "bench", label: "Test models on past cases", about: "Each model does real cases from your export." },
  { id: "grade", label: "Grade the answers", about: "Against what your team actually did." },
  { id: "roi", label: "Work out hours and money", about: "Using your assumptions, with ranges." },
  { id: "report", label: "Write the report", about: "A shareable HTML report." },
];

export function renderRun(el: HTMLElement, ctx: Ctx) {
  let logOpen = false;

  const draw = (job: Job | null) => {
    const active = job && job.project === ctx.name ? job : null;
    mount(el, active ? progressView(active) : idleView());
    wire(active);
  };

  function idleView(): Raw {
    const ready = ctx.project.sources.length > 0;
    const tested = new Set(ctx.project.models);
    const extra = ctx.status.models.filter((m) => !tested.has(m.id));
    return html`
      <div class="panel">
        <div class="panel-head"><div><h2>Run the analysis</h2><p>Takes a few minutes. You'll see the estimated model cost before anything above your limit is spent.</p></div></div>
        <ol class="stages idle">${STAGES.map((s) => html`<li><span class="stage-icon">${icon("Circle")}</span><div><strong>${s.label}</strong><span class="hint">${s.about}</span></div></li>`)}</ol>
        <div class="panel-foot">
          ${!ready ? html`<span class="hint" style="margin-right:auto">Add your data in Setup first.</span>` : ""}
          <button class="btn primary" id="start" type="button" ${ready ? "" : "disabled"}>${icon("Play")}${ctx.project.run ? "Run again from the start" : "Run analysis"}</button>
        </div>
      </div>
      ${ctx.project.run ? html`
        <div class="grid-2 section">
          <div class="panel">
            <div class="panel-head"><div><h2>Redo part of the last run</h2><p>Changed an assumption or a step setting? Start from the stage it affects.</p></div></div>
            <div class="panel-body stack">
              <div class="field"><label for="from-stage">Start from</label>
                <select class="select" id="from-stage">
                  ${STAGES.slice(1).map((s) => html`<option value="${s.id}" ${s.id === "roi" ? "selected" : ""}>${s.label}</option>`)}
                </select>
                <span class="hint">"Work out hours and money" is free: it reuses the test results.</span></div>
              <div><button class="btn" id="from-btn" type="button">${icon("RotateCcw")}Redo from here</button></div>
            </div>
          </div>
          <div class="panel">
            <div class="panel-head"><div><h2>Test more models</h2><p>Runs the same saved cases on other models and adds them to the results.</p></div></div>
            <div class="panel-body stack">
              ${extra.length ? html`
                <div class="stack" style="gap:8px">${extra.map((m) => html`<label class="check"><input type="checkbox" name="extra-model" value="${m.id}" /><code>${modelName(m.id)}</code><span class="hint">${m.about}</span></label>`)}</div>
                <div><button class="btn" id="rerun-btn" type="button">${icon("FlaskConical")}Test selected models</button></div>`
                : html`<p class="hint">Every listed model is already part of this project. Add others in Setup.</p>`}
            </div>
          </div>
        </div>` : ""}`;
  }

  function progressView(job: Job): Raw {
    const idx = STAGES.findIndex((s) => s.id === job.stage);
    const finished = job.state === "done";
    const status = (i: number) =>
      finished || i < idx ? "done" : i === idx ? (job.state === "running" || job.state === "confirm" ? "active" : "stopped") : "pending";
    const p = job.progress;
    const banner = {
      done: html`<div class="callout success">${icon("CircleCheck")}<div class="callout-body"><strong>${job.kind === "review" ? "Results updated with your grades." : "Analysis finished."}</strong><div><button class="btn sm" id="see-results" type="button">See results ${icon("ArrowRight", "sm")}</button></div></div></div>`,
      error: html`<div class="callout error">${icon("TriangleAlert")}<div class="callout-body"><strong>The run stopped with an error.</strong><span>${job.error}</span><div><button class="btn sm" id="retry" type="button">${icon("RotateCcw")}Try again</button></div></div></div>`,
      cancelled: html`<div class="callout warn">${icon("Square")}<div class="callout-body"><strong>Run stopped.</strong><span>Model calls already made are saved; running again continues where it left off.</span><div><button class="btn sm" id="retry" type="button">${icon("Play")}Run again</button></div></div></div>`,
      running: html``,
      confirm: html``,
    }[job.state];
    return html`
      ${banner}
      ${job.state === "confirm" ? html`
        <div class="panel confirm section">
          <div class="panel-body">
            <span class="confirm-icon">${icon("TriangleAlert", "lg")}</span>
            <div class="stack" style="gap:6px">
              <h2>This run will cost about ${usd(job.estimate, 2)} in model calls</h2>
              <p class="muted">That's above your limit of ${usd(job.limit, 2)}. Nothing has been spent on testing yet.</p>
            </div>
            <div class="row">
              <button class="btn" id="decline" type="button">Stop here</button>
              <button class="btn primary" id="approve" type="button">Continue and spend ${usd(job.estimate, 2)}</button>
            </div>
          </div>
        </div>` : ""}
      <div class="panel section">
        <div class="panel-head">
          <div><h2>${job.kind === "rerun" ? "Testing more models" : job.kind === "review" ? "Updating results" : "Running analysis"}</h2>
            <p>${job.estimate != null ? `Estimated model cost ${usd(job.estimate, 2)}` : "Started " + new Date(job.started * 1000).toLocaleTimeString()}</p></div>
          ${["running", "confirm"].includes(job.state) ? html`<button class="btn danger sm" id="cancel" type="button">${icon("Square")}Stop</button>` : ""}
        </div>
        <ol class="stages">
          ${STAGES.map((s, i) => {
            const st = status(i);
            return html`<li class="${st}">
              <span class="stage-icon">${icon(st === "done" ? "CircleCheck" : st === "active" ? "LoaderCircle" : st === "stopped" ? "CircleX" : "Circle", st === "active" ? "spin" : "")}</span>
              <div><strong>${s.label}</strong><span class="hint">${s.about}</span>
                ${st === "active" && s.id === "bench" && p ? html`
                  <div class="meter" role="progressbar" aria-valuemin="0" aria-valuemax="${p.total}" aria-valuenow="${p.done}" aria-label="Model calls">
                    <span style="transform:scaleX(${p.total ? p.done / p.total : 0})"></span></div>
                  <span class="hint num">${p.done} of ${p.total} model calls</span>` : ""}
              </div></li>`;
          })}
        </ol>
        <details class="log" ${logOpen || job.state === "error" ? "open" : ""}>
          <summary>Log</summary>
          <pre id="log">${job.log.join("\n")}</pre>
        </details>
      </div>`;
  }

  function wire(job: Job | null) {
    $("#start", el)?.addEventListener("click", (e) => { busy(e.currentTarget as HTMLButtonElement, true, "Starting"); ctx.startRun(); });
    $("#retry", el)?.addEventListener("click", () => ctx.startRun());
    $("#from-btn", el)?.addEventListener("click", () => ctx.startRun({ from_stage: $<HTMLSelectElement>("#from-stage", el)!.value }));
    $("#rerun-btn", el)?.addEventListener("click", () => {
      const models = $$<HTMLInputElement>("input[name=extra-model]:checked", el).map((i) => i.value);
      if (!models.length) return toast("Tick at least one model.", "error");
      ctx.startRun({ models }, "rerun");
    });
    $("#see-results", el)?.addEventListener("click", () => ctx.go("results"));
    $("#cancel", el)?.addEventListener("click", async (e) => {
      busy(e.currentTarget as HTMLButtonElement, true, "Stopping");
      await api("/job/cancel", { method: "POST", body: {} }).catch((err) => toast(err.message, "error"));
    });
    const decide = async (approve: boolean) => {
      try { await api("/job/confirm", { method: "POST", body: { approve } }); }
      catch (err) { toast((err as Error).message, "error"); }
    };
    $("#approve", el)?.addEventListener("click", (e) => { busy(e.currentTarget as HTMLButtonElement, true, "Continuing"); decide(true); });
    $("#decline", el)?.addEventListener("click", () => decide(false));
    const details = $<HTMLDetailsElement>("details.log", el);
    details?.addEventListener("toggle", () => (logOpen = details.open));
    const pre = $("#log", el);
    if (pre) pre.scrollTop = pre.scrollHeight;
    void job;
  }

  const onJob = (e: Event) => {
    if (!el.isConnected || !document.querySelector("#tabs [data-tab=run][aria-selected=true]")) {
      document.removeEventListener("job", onJob);
      return;
    }
    draw((e as CustomEvent<Job | null>).detail);
  };
  document.addEventListener("job", onJob);
  draw(ctx.job);
}

const css = raw(`
.stages { list-style: none; margin: 0; padding: 8px 18px; display: grid; }
.stages li { display: flex; gap: 12px; padding: 11px 0; border-top: 1px solid var(--border); }
.stages li:first-child { border-top: 0; }
.stages li > div { display: grid; gap: 2px; flex: 1; min-width: 0; }
.stage-icon { color: var(--border-strong); margin-top: 1px; }
.stages li.done .stage-icon { color: var(--good); }
.stages li.active .stage-icon { color: var(--accent); }
.stages li.stopped .stage-icon { color: var(--bad); }
.stages li.pending strong { color: var(--text-3); font-weight: 500; }
.stages.idle strong { font-weight: 500; }
.meter { height: 6px; border-radius: 4px; background: var(--hover); overflow: hidden; margin-top: 8px; max-width: 420px; }
.meter span { display: block; height: 100%; background: var(--accent); border-radius: 4px; transform-origin: left; transition: transform 400ms var(--ease); }
.log { border-top: 1px solid var(--border); }
.log summary { padding: 10px 18px; cursor: pointer; color: var(--text-2); font-weight: 500; font-size: 13px; }
.log pre { margin: 0; padding: 12px 18px 16px; max-height: 280px; overflow: auto; font: 12.5px/1.6 var(--mono); color: var(--text-2); background: var(--subtle); border-radius: 0 0 var(--radius) var(--radius); white-space: pre-wrap; }
.confirm .panel-body { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; gap: 16px; align-items: center; }
.confirm-icon { width: 40px; height: 40px; border-radius: 10px; display: grid; place-items: center; background: var(--warn-soft); color: var(--warn); }
.confirm { border-color: #f0d7a8; box-shadow: var(--shadow-2); }
@media (max-width: 900px) { .confirm .panel-body { grid-template-columns: 1fr; } }
`);
if (!document.getElementById("run-css")) {
  const s = document.createElement("style");
  s.id = "run-css";
  s.textContent = css.value;
  document.head.append(s);
}
