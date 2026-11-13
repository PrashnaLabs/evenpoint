// Run progress, shown on the Results tab while an analysis runs: one card, one bar, the current
// step in plain words, and the spend approval inline. Advanced re-run tools live in Settings.
import { api, type Job } from "../lib/api";
import { $, $$, busy, html, icon, modelName, mount, raw, smallUsd, toast, usd, type Raw } from "../lib/ui";
import type { Ctx } from "./project";

const STAGES: { id: string; label: string }[] = [
  { id: "ingest", label: "Reading your export and removing personal details" },
  { id: "baseline", label: "Measuring how the work flows today" },
  { id: "score", label: "Finding the steps AI could take on" },
  { id: "bench", label: "Testing models on real past cases" },
  { id: "grade", label: "Grading the answers against your team's" },
  { id: "roi", label: "Working out hours and money" },
  { id: "report", label: "Writing the report" },
];

export function renderRun(el: HTMLElement, ctx: Ctx) {
  let logOpen = false;

  const draw = (job: Job | null) => {
    if (!job || job.project !== ctx.name) return;
    mount(el, view(job));
    wire();
  };

  function view(job: Job): Raw {
    const idx = Math.max(0, STAGES.findIndex((s) => s.id === job.stage));
    const p = job.progress;
    const within = job.stage === "bench" && p?.total ? p.done / p.total : 0;
    const share = job.state === "done" ? 1 : (idx + within) / STAGES.length;
    const live = job.state === "running" || job.state === "confirm";
    const title = { run: "Analysing your data", rerun: "Testing more models", review: "Updating results" }[job.kind];
    return html`
      ${job.state === "confirm" ? html`
        <div class="panel confirm">
          <div class="panel-body">
            <div>
              <h2>This run will cost about ${usd(job.estimate, 2)}</h2>
              <p class="muted">That's above your ${smallUsd(job.limit)} limit. Nothing has been spent on testing yet.</p>
            </div>
            <div class="row">
              <button class="btn ghost" id="decline" type="button">Stop</button>
              <button class="btn primary" id="approve" type="button">Continue</button>
            </div>
          </div>
        </div>` : ""}
      <div class="panel run-card">
        <div class="run-top">
          <div>
            <h2>${job.state === "error" ? "The run stopped" : job.state === "cancelled" ? "Run stopped" : title}</h2>
            <p class="muted">${job.state === "error" ? job.error
              : job.state === "cancelled" ? "Finished model calls are saved. Running again continues where it stopped."
              : html`Step ${idx + 1} of ${STAGES.length}: ${STAGES[idx].label}${job.stage === "bench" && p ? html` · <span class="num">${p.done} of ${p.total}</span>` : ""}`}</p>
          </div>
          ${live ? html`<button class="btn ghost sm" id="cancel" type="button">Stop</button>`
            : html`<button class="btn sm" id="retry" type="button">${icon("RotateCcw")}Try again</button>`}
        </div>
        <div class="run-bar is-${job.state}" role="progressbar" aria-label="Progress" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(share * 100)}">
          <span style="transform:scaleX(${share})"></span>
        </div>
        <p class="run-note muted">${job.estimate != null ? `Estimated cost ${usd(job.estimate, 2)}. ` : ""}You can leave this page; the run keeps going.</p>
        <details class="log" ${logOpen || job.state === "error" ? "open" : ""}>
          <summary>Details</summary>
          <pre id="log">${job.log.join("\n")}</pre>
        </details>
      </div>`;
  }

  function wire() {
    $("#retry", el)?.addEventListener("click", () => ctx.startRun());
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
  }

  const onJob = (e: Event) => {
    if (!el.isConnected || !document.querySelector("#tabs [data-tab=results][aria-selected=true]")) {
      document.removeEventListener("job", onJob);
      return;
    }
    draw((e as CustomEvent<Job | null>).detail);
  };
  document.addEventListener("job", onJob);
  draw(ctx.job);
}

/** Settings → "Run again, partly": redo from a stage, or test more models on the saved cases. */
export function advancedRun(ctx: Ctx): Raw {
  if (!ctx.project.run) return html``;
  const tested = new Set(ctx.project.models);
  const extra = ctx.status.models.filter((m) => !tested.has(m.id));
  return html`
    <div class="settings-row" id="advanced">
      <header><h2>Run again, partly</h2><p>Faster and cheaper than a full run.</p></header>
      <div class="stack">
        <div class="row">
          <select class="select" id="from-stage" style="max-width:340px" aria-label="Start from">
            ${STAGES.slice(1).map((s) => html`<option value="${s.id}" ${s.id === "roi" ? "selected" : ""}>From: ${s.label.toLowerCase()}</option>`)}
          </select>
          <button class="btn" id="from-btn" type="button">${icon("RotateCcw")}Redo</button>
        </div>
        <p class="hint">"Working out hours and money" is free: it reuses the test results after you change a number.</p>
        ${extra.length ? html`
          <div class="row">
            ${extra.map((m) => html`<label class="check"><input type="checkbox" name="extra-model" value="${m.id}" /><code>${modelName(m.id)}</code></label>`)}
            <button class="btn" id="rerun-btn" type="button">${icon("FlaskConical")}Test these too</button>
          </div>` : ""}
      </div>
    </div>`;
}

export function wireAdvancedRun(el: HTMLElement, ctx: Ctx) {
  $("#from-btn", el)?.addEventListener("click", () => ctx.startRun({ from_stage: $<HTMLSelectElement>("#from-stage", el)!.value }));
  $("#rerun-btn", el)?.addEventListener("click", () => {
    const models = $$<HTMLInputElement>("input[name=extra-model]:checked", el).map((i) => i.value);
    if (!models.length) return toast("Tick at least one model.", "error");
    ctx.startRun({ models }, "rerun");
  });
}

const css = raw(`
.run-card { padding: 28px; display: grid; gap: 18px; }
.run-top { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; }
.run-top h2 { font-size: 20px; letter-spacing: -0.02em; }
.run-top p { margin-top: 6px; }
.run-bar { height: 8px; border-radius: 999px; background: var(--subtle); overflow: hidden; }
.run-bar span { display: block; height: 100%; border-radius: 999px; background: var(--accent); transform-origin: left; transition: transform 500ms var(--ease); }
.run-bar.is-error span { background: var(--bad); }
.run-bar.is-cancelled span { background: var(--border-strong); }
.run-note { font-size: 13px; }
.log summary { color: var(--text-3); font-size: 13px; font-weight: 600; }
.log pre { margin: 12px 0 0; padding: 14px 16px; max-height: 260px; overflow: auto; font: 12.5px/1.6 var(--mono); color: var(--text-2); background: var(--subtle); border-radius: var(--radius-sm); white-space: pre-wrap; }
.confirm { border-color: color-mix(in srgb, var(--warn) 35%, var(--surface)); background: var(--warn-soft); }
.confirm .panel-body { display: flex; justify-content: space-between; align-items: center; gap: 20px; flex-wrap: wrap; padding: 20px 24px; }
`);
if (!document.getElementById("run-css")) {
  const s = document.createElement("style");
  s.id = "run-css";
  s.textContent = css.value;
  document.head.append(s);
}
