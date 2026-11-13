// Review tab: a person checks a sample of AI outputs, one at a time. Their grades override automatic ones.
import { api } from "../lib/api";
import { $, html, icon, modelName, mount, raw, stepName, toast, TASK, type Raw } from "../lib/ui";
import type { Ctx } from "./project";

type Item = {
  task_id: string; model: string; activity: string; task_type: string; input: string; expected: string; output: string;
  auto_pass: boolean | null; human_pass: boolean | null; note: string | null;
};

export async function renderReview(el: HTMLElement, ctx: Ctx) {
  if (!ctx.project.run) {
    mount(el, html`<div class="panel"><div class="empty"><div class="empty-icon">${icon("ListChecks", "lg")}</div>
      <h2>Nothing to review yet</h2><p>After a run, you can check a sample of the AI's answers yourself. Your grades replace the automatic ones in the results.</p></div></div>`);
    return;
  }
  let perModel = 10;
  let items: Item[] = [];
  let i = 0;
  const marks = new Map<number, boolean | null>();

  async function load() {
    mount(el, html`<div class="panel" style="padding:18px"><div class="skeleton" style="height:240px"></div></div>`);
    items = await api<Item[]>(`/projects/${encodeURIComponent(ctx.name)}/review?n=${perModel}`);
    marks.clear();
    items.forEach((it, k) => it.human_pass != null && marks.set(k, it.human_pass));
    i = 0;
    draw();
  }

  const graded = () => [...marks.values()].filter((v) => v !== null).length;

  function intro(): Raw {
    return html`
      <div class="review-head">
        <div><h2>Check the AI's work</h2>
          <p class="muted">Does each answer match what your team would accept? Your grades override the automatic ones and update the results.</p></div>
        <div class="row">
          <label class="hint" for="per-model">Cases per model</label>
          <select class="select" id="per-model" style="width:90px">${[5, 10, 20, 40].map((n) => html`<option ${n === perModel ? "selected" : ""}>${n}</option>`)}</select>
        </div>
      </div>`;
  }

  function draw() {
    if (!items.length) {
      mount(el, html`${intro()}<div class="panel"><div class="empty"><h2>No answers to review</h2><p>The last run has no successful model outputs.</p></div></div>`);
      return wireCommon();
    }
    if (i >= items.length) return drawSummary();
    const it = items[i];
    const mark = marks.get(i);
    mount(el, html`
      ${intro()}
      <div class="review-progress">
        <span class="num">${i + 1} of ${items.length}</span>
        <div class="dots">${items.map((_, k) => html`<button type="button" class="d ${marks.get(k) === true ? "p" : marks.get(k) === false ? "f" : ""} ${k === i ? "cur" : ""}" data-go="${k}" aria-label="Case ${k + 1}"></button>`)}</div>
        <span class="hint num">${graded()} graded</span>
      </div>
      <div class="panel review-card">
        <div class="panel-head">
          <div class="row" style="gap:8px">
            <strong class="cap">${stepName(it.activity)}</strong><span class="muted">·</span><span class="muted">${TASK[it.task_type]}</span>
            <span class="muted">·</span><code>${modelName(it.model)}</code>
          </div>
          <span class="badge ${it.auto_pass ? "pass" : "fail"}" title="${it.note || ""}">${icon(it.auto_pass ? "Check" : "X")}Auto grade: ${it.auto_pass ? "pass" : "fail"}</span>
        </div>
        <div class="review-body">
          <section class="case"><h3>The case</h3><div class="text">${it.input}</div></section>
          <div class="answers">
            <section><h3>Your team's answer</h3><div class="text">${it.expected}</div></section>
            <section class="ai"><h3>AI answer</h3><div class="text">${it.output}</div></section>
            ${it.note ? html`<p class="hint">Grader's note: ${it.note}</p>` : ""}
          </div>
        </div>
        <div class="panel-foot review-actions">
          <button class="btn ghost" id="prev" type="button" ${i === 0 ? "disabled" : ""}>${icon("ArrowLeft")}Back</button>
          <span class="spacer"></span>
          <button class="btn ghost" id="skip" type="button">Skip <span class="kbd">S</span></button>
          <button class="btn ${mark === false ? "danger" : ""}" id="fail" type="button" aria-pressed="${mark === false}">${icon("X")}Not acceptable <span class="kbd">F</span></button>
          <button class="btn ${mark === true ? "primary" : ""}" id="pass" type="button" aria-pressed="${mark === true}">${icon("Check")}Acceptable <span class="kbd">P</span></button>
        </div>
      </div>`);
    wireCommon();
    $("#prev", el)?.addEventListener("click", () => go(i - 1));
    $("#skip", el)?.addEventListener("click", () => go(i + 1));
    $("#pass", el)?.addEventListener("click", () => grade(true));
    $("#fail", el)?.addEventListener("click", () => grade(false));
    el.querySelectorAll<HTMLButtonElement>("[data-go]").forEach((b) => b.addEventListener("click", () => go(Number(b.dataset.go))));
  }

  function drawSummary() {
    const pass = [...marks.values()].filter((v) => v === true).length;
    const fail = [...marks.values()].filter((v) => v === false).length;
    mount(el, html`
      ${intro()}
      <div class="panel"><div class="empty">
        <div class="empty-icon">${icon("ClipboardCheck", "lg")}</div>
        <h2>${graded() ? `You graded ${graded()} answers` : "You haven't graded any answers"}</h2>
        <p>${pass} acceptable, ${fail} not acceptable. Saving updates accuracy, hours and verdicts. No models are called.</p>
        <div class="row">
          <button class="btn" id="back" type="button">${icon("ArrowLeft")}Keep reviewing</button>
          <button class="btn primary" id="save" type="button" ${graded() ? "" : "disabled"}>Save grades and update results</button>
        </div>
      </div></div>`);
    wireCommon();
    $("#back", el)!.addEventListener("click", () => go(0));
    $("#save", el)?.addEventListener("click", async () => {
      const grades = items.flatMap((it, k) => (marks.get(k) == null ? [] : [{ task_id: it.task_id, model: it.model, pass: marks.get(k) }]));
      await ctx.startRun({ grades }, "review");
    });
  }

  function wireCommon() {
    $("#per-model", el)?.addEventListener("change", (e) => {
      perModel = Number((e.target as HTMLSelectElement).value);
      load().catch((err) => toast(err.message, "error"));
    });
  }

  function go(k: number) {
    i = Math.max(0, Math.min(items.length, k));
    draw();
  }
  function grade(v: boolean) {
    marks.set(i, v);
    go(i + 1);
  }

  const onKey = (e: KeyboardEvent) => {
    if (!el.isConnected || !document.querySelector("#tabs [data-tab=review][aria-selected=true]")) {
      document.removeEventListener("keydown", onKey);
      return;
    }
    if ((e.target as HTMLElement).closest("input, select, textarea") || e.metaKey || e.ctrlKey || i >= items.length) return;
    const k = e.key.toLowerCase();
    if (k === "p") grade(true);
    else if (k === "f") grade(false);
    else if (k === "s" || e.key === "ArrowRight") go(i + 1);
    else if (e.key === "ArrowLeft") go(i - 1);
  };
  document.addEventListener("keydown", onKey);
  await load();
}

const css = raw(`
.review-head { display: flex; justify-content: space-between; align-items: flex-end; gap: 16px; margin-bottom: 16px; }
.review-head p { margin-top: 4px; max-width: 70ch; }
.review-progress { display: flex; align-items: center; gap: 14px; margin-bottom: 12px; font-size: 13px; }
.dots { display: flex; flex-wrap: wrap; gap: 4px; flex: 1; }
.dots .d { width: 10px; height: 10px; border-radius: 3px; border: 1px solid var(--border-strong); background: var(--surface); padding: 0; cursor: pointer; }
.dots .d.p { background: var(--good); border-color: var(--good); }
.dots .d.f { background: var(--bad); border-color: var(--bad); }
.dots .d.cur { outline: 2px solid var(--accent); outline-offset: 1px; }
.review-card .cap { text-transform: capitalize; }
.review-body { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); }
.review-body section { padding: 16px 18px; display: grid; gap: 8px; align-content: start; }
.review-body h3 { font-size: 12px; font-weight: 550; color: var(--text-3); }
.review-body .text { white-space: pre-wrap; overflow-wrap: anywhere; max-height: 360px; overflow: auto; line-height: 1.6; color: var(--text); }
.review-body .case { border-right: 1px solid var(--border); background: var(--subtle); }
.answers { display: grid; align-content: start; }
.answers section + section { border-top: 1px solid var(--border); }
.answers .ai { background: var(--accent-soft); }
.answers > .hint { padding: 0 18px 14px; }
.review-actions { justify-content: flex-start; }
.review-actions .spacer { flex: 1; }
.review-actions .kbd { margin-left: 4px; }
.review-actions .btn.primary .kbd { background: transparent; color: #fff; border-color: rgb(255 255 255 / 0.5); }
@media (max-width: 900px) {
  .review-body { grid-template-columns: 1fr; }
  .review-body .case { border-right: 0; border-bottom: 1px solid var(--border); }
  .review-head { flex-direction: column; align-items: stretch; }
  .review-actions { flex-wrap: wrap; }
  .review-actions .kbd { display: none; }
}
`);
if (!document.getElementById("review-css")) {
  const s = document.createElement("style");
  s.id = "review-css";
  s.textContent = css.value;
  document.head.append(s);
}
