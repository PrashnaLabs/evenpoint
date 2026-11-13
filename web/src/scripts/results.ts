// Results tab, distilled: the answer, one row per step, one next action. Evidence waits under "Details".
import { api } from "../lib/api";
import {
  $, $$, MODE, dateShort, hrs, html, icon, modelName, mount, num, pct, raw, smallUsd, stepName, usd,
  verdictBadge, type Raw,
} from "../lib/ui";
import type { Ctx } from "./project";

type Row = Record<string, any>;

export async function renderResults(el: HTMLElement, ctx: Ctx) {
  if (!ctx.project.run) {
    mount(el, html`
      <div class="panel"><div class="empty">
        <div class="empty-icon">${icon("Gauge", "lg")}</div>
        <h2>No results yet</h2>
        <p>${ctx.project.sources.length
          ? "Your data is ready. Run the analysis to see what's worth automating."
          : "Add your export, then run the analysis."}</p>
        <div class="row"><button class="btn primary" type="button" id="empty-go">
          ${ctx.project.sources.length ? html`${icon("Play")}Run analysis` : html`${icon("Upload")}Add your data`}</button></div>
      </div></div>`);
    $("#empty-go")!.addEventListener("click", () => (ctx.project.sources.length ? ctx.startRun()
      : (location.href = `/start/?p=${encodeURIComponent(ctx.name)}&step=1`)));
    return;
  }
  mount(el, html`<div style="display:grid;gap:14px">${[60, 28, 28, 28].map((h) => html`<div class="skeleton" style="height:${h}px"></div>`)}</div>`);
  const d = await api<Row>(`/projects/${encodeURIComponent(ctx.name)}/results`);
  if (!d.run) return mount(el, html`<div class="callout info">${icon("Info")}<span>No completed run yet.</span></div>`);

  const reviewed = (d.summaries as Row[]).some((s) => s.judge_human_agreement != null);
  mount(el, html`
    ${answer(d)}
    ${(d.quality.warnings as string[]).map((w) => html`<div class="callout warn">${icon("TriangleAlert")}<span>${w}</span></div>`)}
    ${steps(d)}
    ${reviewed ? "" : html`<button class="firm-up" type="button" id="firm-up">
      ${icon("ListChecks")}<span><strong>Check 10 of the AI's answers yourself</strong> to firm this up. Takes five minutes.</span>${icon("ArrowRight")}</button>`}
    ${details(d)}`);

  $$<HTMLButtonElement>("[data-expand]", el).forEach((b) =>
    b.addEventListener("click", () => {
      const row = $(`#detail-${b.dataset.expand}`, el)!;
      row.hidden = !row.hidden;
      b.setAttribute("aria-expanded", String(!row.hidden));
    }));
  $("#firm-up", el)?.addEventListener("click", () => ctx.go("review"));
  $("#edit-assumptions", el)?.addEventListener("click", (e) => { e.preventDefault(); ctx.go("setup"); });
  $("#more-models", el)?.addEventListener("click", (e) => {
    e.preventDefault();
    ctx.go("setup");
    setTimeout(() => document.getElementById("advanced")?.scrollIntoView({ behavior: "smooth", block: "center" }), 400);
  });
}

/** Money range from the hours range: same bootstrap interval, priced with the user's hourly rate. */
const valueAt = (d: Row, r: Row, hours: number) => hours * d.assumptions.hourly_rate - r.ai_cost_month;

// ---------------------------------------------------------------- the answer
function answer(d: Row): Raw {
  const worth = (d.best as Row[]).filter((r) => r.verdict !== "dont_automate");
  const tested = d.best.length;
  const sum = (f: (r: Row) => number) => worth.reduce((a, r) => a + (f(r) || 0), 0);
  const q = d.quality;
  const perStep = Math.max(0, ...(d.summaries as Row[]).map((s) => s.n));  // each model saw this many cases per step
  const facts = html`
    <dl class="answer-facts num">
      <div><dt>Steps worth automating</dt><dd>${worth.length} of ${tested}</dd></div>
      <div><dt>Cases analysed</dt><dd>${num(q.cases)} <span>${dateShort(q.first_ts)} to ${dateShort(q.last_ts)}</span></dd></div>
      <div><dt>Cost of this analysis</dt><dd>${usd(d.total_cost, 2)}</dd></div>
    </dl>`;

  if (!worth.length) {
    return html`
      <section class="answer-card">
        <div class="answer-main">
          <p class="answer-label">Estimated savings</p>
          <p class="answer-none">Nothing worth automating yet</p>
          <p class="answer-sub">${tested
            ? `None of the ${tested} tested ${tested === 1 ? "step saves" : "steps save"} more than it costs with these models and your numbers.`
            : "No step could be tested yet."}</p>
        </div>
        ${facts}
      </section>`;
  }

  const value = sum((r) => r.net_value_month);
  const low = sum((r) => r.net_value_low);
  const high = sum((r) => valueAt(d, r, r.net_hours_high));
  const lo = Math.min(0, low), hi = Math.max(high, 1);
  const pos = (v: number) => ((v - lo) / (hi - lo)) * 100;
  return html`
    <section class="answer-card">
      <div class="answer-grid">
        <div class="answer-main">
          <p class="answer-label">Estimated savings</p>
          <p class="answer-value num">${usd(value)}<span> / month</span></p>
          <p class="answer-sub">${hrs(sum((r) => r.net_hours_month))} of team time a month, after AI costs and checking its work</p>
        </div>
        <div class="answer-range">
          <p class="answer-label">Real savings could be anywhere from</p>
          <p class="range-figures num"><strong>${usd(low)}</strong> to <strong>${usd(high)}</strong> <span>a month</span></p>
          <div class="answer-bar" role="img" aria-label="${`Estimate ${usd(value)} a month, could be between ${usd(low)} and ${usd(high)}`}">
            <span class="answer-band" style="left:${pos(low)}%;width:${pos(high) - pos(low)}%"></span>
            <span class="answer-dot" style="left:${pos(value)}%"></span>
          </div>
          <p class="answer-why">${usd(value)} is the best estimate. The real figure is uncertain because the AI was tested on ${num(perStep)} past cases per step, not all of them. Testing more cases narrows this range.</p>
        </div>
      </div>
      ${facts}
    </section>`;
}

// ---------------------------------------------------------------- one row per step
function steps(d: Row): Raw {
  const best = d.best as Row[];
  const cand = Object.fromEntries((d.candidates as Row[]).map((c) => [c.activity, c]));
  const n = Object.fromEntries((d.summaries as Row[]).map((s) => [`${s.activity}|${s.model}`, s.n]));
  const untested = (d.dont as Row[]).filter((r) => !r.model);
  if (!best.length && !untested.length) return html``;
  const lo = Math.min(0, ...best.map((r) => r.net_hours_low));
  const hi = Math.max(0, ...best.map((r) => r.net_hours_high));

  return html`
    <section class="step-list" aria-label="Steps">
      ${best.map((r, i) => html`
        <div class="step-row">
          <div class="step-main">
            <div class="step-name">
              <strong>${stepName(r.activity)}</strong>${verdictBadge(r.verdict)}
            </div>
            <p class="step-why"><code>${modelName(r.model)}</code> was right on ${pct(r.accuracy)} of ${n[`${r.activity}|${r.model}`] || "–"} past cases</p>
          </div>
          <div class="step-bar">${bar(r, lo, hi)}</div>
          <div class="step-figures num">
            <strong>${hrs(r.net_hours_month)}</strong><span>${usd(r.net_value_month)} / mo</span>
          </div>
          <button class="btn ghost sm step-toggle" type="button" data-expand="${i}" aria-expanded="false" aria-controls="detail-${i}">
            ${icon("ChevronDown")}<span class="sr-only">More about ${stepName(r.activity)}</span></button>
          <div class="step-detail" id="detail-${i}" hidden>
            <p>${r.reason} Money: ${usd(r.net_value_low)} to ${usd(valueAt(d, r, r.net_hours_high))} a month${r.payback_months != null ? `, paying back setup in ${num(r.payback_months, 1)} months` : ""}.
              ${cand[r.activity]?.reason ? html`<span class="soft">Why this step: ${cand[r.activity].reason}</span>` : ""}</p>
            ${optionsTable((d.roi as Row[]).filter((o) => o.activity === r.activity))}
          </div>
        </div>`)}
      ${untested.map((r) => html`
        <div class="step-row untested">
          <div class="step-main">
            <div class="step-name"><strong>${stepName(r.activity)}</strong><span class="badge">${icon("Ban")}Not tested</span></div>
            <p class="step-why">${r.reason}</p>
          </div>
        </div>`)}
    </section>`;
}

function bar(r: Row, lo: number, hi: number): Raw {
  const span = hi - lo || 1;
  const pos = (v: number) => ((Math.min(Math.max(v, lo), hi) - lo) / span) * 100;
  const left = Math.min(r.net_hours_low, r.net_hours_high);
  const right = Math.max(r.net_hours_low, r.net_hours_high);
  const tip = `${hrs(r.net_hours_month)} a month, likely between ${hrs(r.net_hours_low)} and ${hrs(r.net_hours_high)}`;
  return html`
    <div class="range ${r.verdict}" role="img" aria-label="${tip}" title="${tip}">
      <span class="range-zero" style="left:${pos(0)}%"></span>
      <span class="range-span" style="left:${pos(left)}%;width:${pos(right) - pos(left)}%"></span>
      <span class="range-point" style="left:${pos(r.net_hours_month)}%"></span>
    </div>
    <span class="range-text num">${hrs(r.net_hours_low)} to ${hrs(r.net_hours_high)}</span>`;
}

function optionsTable(rows: Row[]): Raw {
  return html`
    <div class="table-wrap"><table class="table compact">
      <thead><tr><th>Model</th><th>How it runs</th><th>Verdict</th><th class="r">Right</th><th class="r">Hours / month</th><th class="r">Value / month</th></tr></thead>
      <tbody>${rows.map((o) => html`<tr>
        <td><code>${modelName(o.model)}</code></td><td>${MODE[o.mode]}</td><td>${verdictBadge(o.verdict)}</td>
        <td class="r">${pct(o.accuracy)}</td><td class="r">${hrs(o.net_hours_month)}</td><td class="r">${usd(o.net_value_month)}</td></tr>`)}
      </tbody></table></div>`;
}

// ---------------------------------------------------------------- details, collapsed
function details(d: Row): Raw {
  const sums = d.summaries as Row[];
  const a = d.assumptions;
  const steps = d.steps as Row[];
  const calls = d.calls as Row[];
  const section = (title: string, summary: string | Raw, body: Raw) => html`
    <details class="more"><summary><span>${title}</span><span class="more-sum">${summary}</span></summary><div class="more-body">${body}</div></details>`;
  return html`
    <section class="details-list">
      <h2>Details</h2>
      ${section("How each model did", `${new Set(sums.map((s) => s.model)).size} models on ${num(sums.reduce((x, s) => x + s.n, 0))} test cases`, html`
        <div class="table-wrap"><table class="table compact">
          <thead><tr><th>Step</th><th>Model</th><th class="r">Right</th><th class="r">Cost per case</th><th class="r">Speed</th></tr></thead>
          <tbody>${sums.map((s) => html`<tr><td>${stepName(s.activity)}</td><td><code>${modelName(s.model)}</code></td>
            <td class="r">${pct(s.accuracy)} <span class="soft">of ${s.n}</span></td><td class="r">${smallUsd(s.cost_per_task)}</td>
            <td class="r">${num((s.latency_p50_ms || 0) / 1000, 1)} s</td></tr>`)}</tbody></table></div>
        <p class="soft"><a href="#" id="more-models">Test another model</a> on the same cases.</p>`)}
      ${section("How the work flows today", `${num(steps.length)} steps, measured from your export`, html`
        <div class="table-wrap"><table class="table compact">
          <thead><tr><th>Step</th><th class="r">Per month</th><th class="r">Minutes each</th><th class="r">Hours / month</th></tr></thead>
          <tbody>${steps.map((s) => html`<tr><td>${stepName(s.activity)}</td><td class="r">${num(s.volume_per_month)}</td>
            <td class="r">${num(s.median_minutes, 1)}${s.minutes_source === "config" ? html` <span class="soft">set by you</span>` : ""}</td>
            <td class="r">${num(s.baseline_hours_month, 1)}</td></tr>`)}</tbody></table></div>`)}
      ${section("Your assumptions", `${usd(a.hourly_rate)} an hour, ${num(a.review_draft, 1)} min to check an AI answer`, html`
        <dl class="kv">
          <dt>Hourly cost of a team member</dt><dd>${usd(a.hourly_rate)}</dd>
          <dt>Minutes to check one AI answer</dt><dd>${num(a.review_draft, 1)}</dd>
          <dt>Extra minutes when a wrong answer reaches a customer</dt><dd>${num(a.failure_minutes, 1)}</dd>
          <dt>One-off setup cost</dt><dd>${usd(a.setup_cost_usd)}</dd>
          <dt>Test cases per step</dt><dd>${num(a.tasks_per_candidate)}</dd>
        </dl>
        <p class="soft"><a href="#" id="edit-assumptions">Change these</a>. Results update without re-testing.</p>`)}
      ${section("Data and privacy", `${num(calls.reduce((x, c) => x + c.n, 0))} model calls, sent only to ${(d.providers as string[]).join(", ") || "no one"}`, html`
        <dl class="kv">
          <dt>Cases</dt><dd>${num(d.quality.cases)}</dd>
          <dt>Events</dt><dd>${num(d.quality.events)}</dd>
          <dt>Cases without text</dt><dd>${num(d.quality.cases_without_text)}</dd>
          <dt>Model calls</dt><dd>${num(calls.reduce((x, c) => x + c.n, 0))}</dd>
          <dt>Failed calls</dt><dd>${num(calls.reduce((x, c) => x + c.errors, 0))}</dd>
          <dt>Total cost</dt><dd>${usd(d.total_cost, 2)}</dd>
        </dl>
        <p class="soft">Emails, phone numbers, card numbers and staff names are removed before anything is sent. Customer names in free text can slip through. Every prompt and answer is kept in <code>.evenpoint/project.duckdb</code>.</p>
        ${(d.unpriced as string[]).length ? html`<p class="soft">No price is known for ${(d.unpriced as string[]).map(modelName).join(", ")}; its cost counts as $0.</p>` : ""}`)}
    </section>`;
}

const css = raw(`
.answer-card { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); overflow: hidden; }
.answer-grid { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); }
.answer-main, .answer-range { padding: 28px; display: grid; gap: 6px; align-content: start; }
.answer-range { border-left: 1px solid var(--border); background: var(--subtle); }
.answer-label { font-size: 13px; font-weight: 600; color: var(--text-3); }
.answer-value { font-size: 28px; font-weight: 700; letter-spacing: -0.025em; line-height: 1.2; color: var(--text); }
.answer-value span { font-size: 16px; font-weight: 500; color: var(--text-3); letter-spacing: 0; }
.answer-sub { font-size: 14px; color: var(--text-2); }
.answer-none { font-size: 24px; font-weight: 700; letter-spacing: -0.02em; }
.range-figures { font-size: 19px; color: var(--text-2); }
.range-figures strong { color: var(--text); font-weight: 700; }
.range-figures span { font-size: 14px; color: var(--text-3); }
.answer-bar { position: relative; height: 8px; margin: 10px 0 6px; border-radius: 999px; background: var(--border); }
.answer-band { position: absolute; top: 0; bottom: 0; border-radius: 999px; background: color-mix(in srgb, var(--accent) 35%, var(--surface)); }
.answer-dot { position: absolute; top: 50%; width: 14px; height: 14px; margin: -7px 0 0 -7px; border-radius: 50%; background: var(--accent); box-shadow: 0 0 0 3px var(--surface); }
.answer-why { font-size: 13px; color: var(--text-3); }
.answer-facts { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); margin: 0; border-top: 1px solid var(--border); }
.answer-facts div { padding: 16px 28px; }
.answer-facts div + div { border-left: 1px solid var(--border); }
.answer-facts dt { font-size: 13px; color: var(--text-3); }
.answer-facts dd { margin: 2px 0 0; font-size: 16px; font-weight: 650; }
.answer-facts dd span { font-size: 13px; font-weight: 400; color: var(--text-3); margin-left: 4px; }
.step-list { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); }
.step-row { display: grid; grid-template-columns: minmax(0, 1.5fr) minmax(160px, 1fr) 110px 32px; gap: 8px 28px; align-items: center; padding: 18px 20px; }
.step-row + .step-row { border-top: 1px solid var(--border); }
.step-row.untested { grid-template-columns: 1fr; }
.step-name { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.step-name strong { font-size: 15px; font-weight: 600; }
.step-why { margin-top: 4px; color: var(--text-3); font-size: 14px; }
.step-why code { font-size: 13px; color: var(--text-2); }
.step-figures { display: grid; justify-items: end; gap: 1px; white-space: nowrap; }
.step-figures strong { font-size: 19px; font-weight: 600; letter-spacing: -0.01em; }
.step-figures span { color: var(--text-3); font-size: 13px; }
.step-toggle { justify-self: end; }
.step-toggle .ico { transition: transform 200ms var(--ease); }
[aria-expanded="true"] .ico { transform: rotate(180deg); }
.step-detail { grid-column: 1 / -1; display: grid; gap: 12px; padding-top: 6px; }
.step-detail p { color: var(--text-2); max-width: 80ch; }
.step-detail .table-wrap, .more .table-wrap { border: 1px solid var(--border); border-radius: var(--radius-sm); }
.range { position: relative; height: 8px; border-radius: 8px; background: var(--hover); }
.range-zero { position: absolute; top: -4px; bottom: -4px; width: 1px; background: var(--border-strong); }
.range-span { position: absolute; top: 0; bottom: 0; border-radius: 8px; background: var(--c-soft); }
.range-point { position: absolute; top: 50%; width: 12px; height: 12px; margin: -6px 0 0 -6px; border-radius: 50%; background: var(--c); box-shadow: 0 0 0 2px var(--surface); }
.range.automate { --c: var(--good); }
.range.review { --c: var(--warn); }
.range.dont_automate { --c: var(--quiet); }
.range-span { background: color-mix(in srgb, var(--c) 28%, var(--surface)) !important; }
.range-text { display: block; margin-top: 6px; font-size: 13px; color: var(--text-3); }
.table.compact td, .table.compact th { padding: 8px 12px; }
.firm-up { display: inline-flex; align-items: center; gap: 10px; padding: 6px 0; border: 0; background: none; font: inherit; color: var(--text-2); cursor: pointer; }
.firm-up > span { text-align: left; }
.firm-up strong { color: var(--accent); font-weight: 550; }
.firm-up .ico { color: var(--accent); }
.firm-up:hover strong { text-decoration: underline; text-underline-offset: 3px; }
.details-list { margin-top: 36px !important; }
.details-list h2 { font-size: 13px; font-weight: 550; color: var(--text-3); margin-bottom: 4px; }
.more { border-bottom: 1px solid var(--border); }
.more summary { display: flex; align-items: center; gap: 10px; padding: 14px 2px; font-weight: 550; color: var(--text); }
.more summary::before { color: var(--text-3); }
.more-sum { margin-left: auto; font-weight: 400; color: var(--text-3); font-size: 13px; text-align: right; }
.more-body { display: grid; gap: 12px; padding: 0 0 18px 22px; }
.kv { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 8px 16px; margin: 0; max-width: 560px; }
.kv dt { color: var(--text-2); }
.kv dd { margin: 0; text-align: right; font-weight: 550; font-variant-numeric: tabular-nums; }
@media (max-width: 900px) {
  .answer-grid, .answer-facts { grid-template-columns: 1fr; }
  .answer-range { border-left: 0; border-top: 1px solid var(--border); }
  .answer-main, .answer-range { padding: 22px; }
  .answer-facts div { padding: 12px 22px; }
  .answer-facts div + div { border-left: 0; border-top: 1px solid var(--border); }
  .step-row { grid-template-columns: minmax(0, 1fr) auto; gap: 12px 20px; }
  .step-main { grid-column: 1; grid-row: 1; }
  .step-toggle { grid-column: 2; grid-row: 1; align-self: start; }
  .step-bar { grid-column: 1; grid-row: 2; }
  .step-figures { grid-column: 2; grid-row: 2; }
  .more-sum { display: none; }
}
`);
if (!document.getElementById("results-css")) {
  const s = document.createElement("style");
  s.id = "results-css";
  s.textContent = css.value;
  document.head.append(s);
}
