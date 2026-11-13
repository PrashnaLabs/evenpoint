// Results tab: the answer first (a sentence), then one row per tested step with its range, then the evidence.
import { api } from "../lib/api";
import {
  $, $$, MODE, TASK, dateShort, hrs, html, icon, modelName, mount, num, pct, raw, smallUsd, stepName, usd,
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
          ? "Your data is set up. Run the analysis to measure each step and test the models."
          : "Add your export in Setup, then run the analysis."}</p>
        <div class="row"><button class="btn primary" type="button" id="empty-go">
          ${ctx.project.sources.length ? html`${icon("Play")}Run analysis` : html`${icon("Upload")}Go to Setup`}</button></div>
      </div></div>`);
    $("#empty-go")!.addEventListener("click", () => (ctx.project.sources.length ? ctx.startRun() : ctx.go("setup")));
    return;
  }
  mount(el, html`<div class="panel" style="padding:18px;display:grid;gap:12px">${[1, 2, 3, 4].map(() => html`<div class="skeleton" style="height:28px"></div>`)}</div>`);
  const d = await api<Row>(`/projects/${encodeURIComponent(ctx.name)}/results`);
  if (!d.run) return mount(el, html`<div class="callout info">${icon("Info")}<span>No completed run yet.</span></div>`);

  mount(el, html`
    ${headline(d)}
    ${recommendations(d)}
    ${dontAutomate(d)}
    ${models(d)}
    ${baseline(d)}
    <div class="grid-2 section">${quality(d)}${assumptions(d)}</div>
    ${audit(d)}`);

  $$<HTMLButtonElement>("[data-expand]", el).forEach((b) =>
    b.addEventListener("click", () => {
      const row = $(`#detail-${b.dataset.expand}`, el)!;
      const open = row.hidden;
      row.hidden = !open;
      b.setAttribute("aria-expanded", String(open));
    }));
  $("#edit-assumptions", el)?.addEventListener("click", () => ctx.go("setup"));
  $("#to-review", el)?.addEventListener("click", () => ctx.go("review"));
}

/** Money range from the hours range: same bootstrap interval, priced with the user's hourly rate. */
const valueAt = (d: Row, r: Row, hours: number) => hours * d.assumptions.hourly_rate - r.ai_cost_month;

function headline(d: Row): Raw {
  const worth = (d.best as Row[]).filter((r) => r.verdict !== "dont_automate");
  const tested = d.best.length;
  const sum = (f: (r: Row) => number) => worth.reduce((a, r) => a + (f(r) || 0), 0);
  const q = d.quality;
  const sentence = worth.length
    ? html`Automating <strong>${worth.length} of ${tested}</strong> tested ${tested === 1 ? "step" : "steps"} would save about
        <strong>${hrs(sum((r) => r.net_hours_month))} a month</strong>
        <span class="muted">(${hrs(sum((r) => r.net_hours_low))} to ${hrs(sum((r) => r.net_hours_high))})</span>,
        worth <strong>${usd(sum((r) => r.net_value_month))}</strong> a month
        <span class="muted">(${usd(sum((r) => r.net_value_low))} to ${usd(sum((r) => valueAt(d, r, r.net_hours_high)))})</span>.`
    : tested
      ? html`None of the ${tested} tested steps is worth automating with these models and assumptions yet.`
      : html`No step could be tested. See below for why.`;
  return html`
    <div class="panel headline">
      <div class="panel-body">
        <p class="headline-text">${sentence}</p>
        <dl class="facts">
          <div><dt>Cases analysed</dt><dd class="num">${num(q.cases)}</dd></div>
          <div><dt>Data covers</dt><dd>${dateShort(q.first_ts)} – ${dateShort(q.last_ts)}</dd></div>
          <div><dt>Models tested</dt><dd class="num">${new Set((d.summaries as Row[]).map((s) => s.model)).size}</dd></div>
          <div><dt>Cost of this analysis</dt><dd class="num">${usd(d.total_cost, 2)}</dd></div>
        </dl>
      </div>
    </div>`;
}

function rangeBar(r: Row, lo: number, hi: number): Raw {
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
    <div class="range-text num"><strong>${hrs(r.net_hours_month)}</strong> <span>${hrs(r.net_hours_low)} to ${hrs(r.net_hours_high)}</span></div>`;
}

function axis(lo: number, hi: number): Raw {
  const pos = (v: number) => ((v - lo) / (hi - lo || 1)) * 100;
  return html`<div class="axis num" aria-hidden="true">
    <span style="left:0">${hrs(lo)}</span>
    ${lo < 0 && hi > 0 ? html`<span class="zero" style="left:${pos(0)}%">0 h</span>` : ""}
    <span style="right:0">${hrs(hi)}</span></div>`;
}

function recommendations(d: Row): Raw {
  const best = d.best as Row[];
  if (!best.length) return html``;
  const lo = Math.min(0, ...best.map((r) => r.net_hours_low));
  const hi = Math.max(0, ...best.map((r) => r.net_hours_high));
  const cand = Object.fromEntries((d.candidates as Row[]).map((c) => [c.activity, c]));
  const n = Object.fromEntries((d.summaries as Row[]).map((s) => [`${s.activity}|${s.model}`, s.n]));
  return html`
    <div class="panel section">
      <div class="panel-head">
        <div><h2>Recommendations</h2><p>The best option for each tested step. Dots show the likely hours saved per month; the shaded band is the range the test sample supports.</p></div>
      </div>
      <div class="recs" role="table" aria-label="Recommendations">
        <div class="rec-head" role="row">
          <span role="columnheader">Step</span><span role="columnheader">Verdict</span><span role="columnheader">Best model</span>
          <span role="columnheader" class="r">Correct</span><span role="columnheader">Hours saved / month ${axis(lo, hi)}</span>
          <span role="columnheader" class="r">Value / month</span><span></span>
        </div>
        ${best.map((r, i) => html`
          <div class="rec" role="rowgroup">
            <div class="rec-main" role="row">
              <div class="rec-step" role="cell">
                <strong>${stepName(r.activity)}</strong>
                <span class="sub">${TASK[cand[r.activity]?.task_type] || ""}</span>
              </div>
              <div role="cell">${verdictBadge(r.verdict)}</div>
              <div class="rec-model" role="cell">
                <code>${modelName(r.model)}</code>
                <span class="sub">${MODE[r.mode]}</span>
              </div>
              <div class="rec-acc num" role="cell"><strong>${pct(r.accuracy)}</strong><span class="sub">${n[`${r.activity}|${r.model}`] || "–"} test cases</span></div>
              <div class="rec-range" role="cell">${rangeBar(r, lo, hi)}</div>
              <div class="rec-value num" role="cell"><strong>${usd(r.net_value_month)}</strong>
                <span class="sub">${usd(r.net_value_low)} to ${usd(valueAt(d, r, r.net_hours_high))}</span>
                ${r.payback_months != null ? html`<span class="sub">Pays back in ${num(r.payback_months, 1)} mo</span>` : ""}</div>
              <button class="btn ghost sm rec-toggle" type="button" data-expand="${i}" aria-expanded="false" aria-controls="detail-${i}">${icon("ChevronDown")}<span class="sr-only">Details for ${stepName(r.activity)}</span></button>
            </div>
            <div class="rec-detail" id="detail-${i}" hidden>
              <p class="reason">${r.reason} ${cand[r.activity]?.reason ? html`<span class="muted">Why this step: ${cand[r.activity].reason}</span>` : ""}</p>
              ${optionsTable((d.roi as Row[]).filter((o) => o.activity === r.activity))}
            </div>
          </div>`)}
      </div>
    </div>`;
}

function optionsTable(rows: Row[]): Raw {
  return html`
    <div class="table-wrap"><table class="table compact">
      <thead><tr><th>Model</th><th>How it runs</th><th>Verdict</th><th class="r">Correct</th><th class="r">Hours / month</th><th class="r">Low end</th><th class="r">Value / month</th><th class="r">AI cost / month</th></tr></thead>
      <tbody>${rows.map((o) => html`<tr>
        <td><code>${modelName(o.model)}</code></td><td>${MODE[o.mode]}</td><td>${verdictBadge(o.verdict)}</td>
        <td class="r">${pct(o.accuracy)}</td><td class="r">${hrs(o.net_hours_month, 1)}</td><td class="r">${hrs(o.net_hours_low, 1)}</td>
        <td class="r">${usd(o.net_value_month)}</td><td class="r">${usd(o.ai_cost_month, 2)}</td></tr>`)}
      </tbody></table></div>`;
}

/** Steps that never reached a test (too risky, or nothing to compare against). Tested ones live in Recommendations. */
function dontAutomate(d: Row): Raw {
  const rows = (d.dont as Row[]).filter((r) => !r.model);
  if (!rows.length) return html``;
  return html`
    <div class="panel section">
      <div class="panel-head"><div><h2>Not tested</h2><p>Steps Evenpoint left alone: the risk of a wrong answer is too high, or your export doesn't record what a person produced.</p></div></div>
      <ul class="plain-list">
        ${rows.map((r) => html`<li>${icon("Ban")}<div><strong>${stepName(r.activity)}</strong><p>${r.reason}</p></div></li>`)}
      </ul>
    </div>`;
}

function models(d: Row): Raw {
  const order = (d.best as Row[]).map((r) => r.activity);
  const chosen = new Set((d.best as Row[]).map((r) => `${r.activity}|${r.model}`));
  const rows = [...(d.summaries as Row[])].sort((a, b) =>
    (order.indexOf(a.activity) + 99) % 99 - (order.indexOf(b.activity) + 99) % 99 || a.model.localeCompare(b.model));
  if (!rows.length) return html``;
  const humans = rows.some((s) => s.judge_human_agreement != null);
  return html`
    <div class="panel section">
      <div class="panel-head">
        <div><h2>Model comparison</h2><p>How each model did on the same past cases, graded against what your team actually did.</p></div>
        <button class="btn sm" type="button" id="to-review">${icon("ListChecks")}Check the grading yourself</button>
      </div>
      <div class="table-wrap"><table class="table">
        <thead><tr><th>Step</th><th>Model</th><th class="r">Test cases</th><th class="r">Correct</th><th class="r">Cost per case</th>
          <th class="r">Cost per correct case</th><th class="r">Typical speed</th><th class="r">Errors</th>${humans ? html`<th class="r">Grader agrees with you</th>` : ""}</tr></thead>
        <tbody>${rows.map((s) => html`<tr>
          <td>${stepName(s.activity)}</td><td><code>${modelName(s.model)}</code>${chosen.has(`${s.activity}|${s.model}`) ? html` <span class="badge outline">Recommended</span>` : ""}</td><td class="r">${s.n}</td>
          <td class="r"><span class="acc"><span class="acc-bar" style="--v:${s.accuracy}"></span>${pct(s.accuracy)}</span></td>
          <td class="r">${smallUsd(s.cost_per_task)}</td><td class="r">${smallUsd(s.cost_per_success)}</td>
          <td class="r">${num((s.latency_p50_ms || 0) / 1000, 1)} s</td><td class="r">${pct(s.error_rate)}</td>
          ${humans ? html`<td class="r">${pct(s.judge_human_agreement)}</td>` : ""}</tr>`)}
        </tbody></table></div>
    </div>`;
}

function baseline(d: Row): Raw {
  const steps = d.steps as Row[];
  const edges = d.edges as Row[];
  const maxN = Math.max(1, ...edges.map((e) => e.n));
  return html`
    <div class="grid-2 section baseline">
      <div class="panel">
        <div class="panel-head"><div><h2>How the work flows today</h2><p>Measured from your export before any AI is involved.</p></div></div>
        <div class="table-wrap"><table class="table">
          <thead><tr><th>Step</th><th class="r">Per month</th><th class="r">Minutes each</th><th class="r">Hours / month</th></tr></thead>
          <tbody>${steps.map((s) => html`<tr>
            <td>${stepName(s.activity)}${s.rework_rate > 0.05 ? html`<div class="sub">${pct(s.rework_rate)} repeated</div>` : ""}</td>
            <td class="r">${num(s.volume_per_month)}</td>
            <td class="r">${num(s.median_minutes, 1)}${s.minutes_source === "config" ? html`<span class="assumed" title="You set this in Setup">set</span>` : ""}</td>
            <td class="r">${num(s.baseline_hours_month, 1)}</td></tr>`)}
          </tbody></table></div>
      </div>
      <div class="panel">
        <div class="panel-head"><div><h2>Most common paths</h2><p>Which step follows which, by number of cases.</p></div></div>
        <ul class="flows">
          ${edges.slice(0, 10).map((e) => html`<li>
            <span class="flow-label">${stepName(e.source_activity)} ${icon("ArrowRight", "sm")} ${stepName(e.target_activity)}</span>
            <span class="flow-bar"><span style="width:${(e.n / maxN) * 100}%"></span></span>
            <span class="num flow-n">${num(e.n)}</span></li>`)}
        </ul>
      </div>
    </div>`;
}

function quality(d: Row): Raw {
  const q = d.quality;
  return html`
    <div class="panel">
      <div class="panel-head"><div><h2>Data quality</h2></div></div>
      <div class="panel-body stack">
        ${(q.warnings as string[]).length
          ? (q.warnings as string[]).map((w) => html`<div class="callout warn">${icon("TriangleAlert")}<span>${w}</span></div>`)
          : html`<div class="callout success">${icon("CircleCheck")}<span>No problems found in the export.</span></div>`}
        <dl class="kv">
          <dt>Events</dt><dd class="num">${num(q.events)}</dd>
          <dt>Cases</dt><dd class="num">${num(q.cases)}</dd>
          <dt>Steps found</dt><dd class="num">${num(q.activities)}</dd>
          <dt>Cases with one event</dt><dd class="num">${num(q.single_event_cases)}</dd>
          <dt>Cases without text</dt><dd class="num">${num(q.cases_without_text)}</dd>
        </dl>
      </div>
    </div>`;
}

function assumptions(d: Row): Raw {
  const a = d.assumptions;
  return html`
    <div class="panel">
      <div class="panel-head">
        <div><h2>Your assumptions</h2><p>Every result above depends on these.</p></div>
        <button class="btn sm" type="button" id="edit-assumptions">Edit</button>
      </div>
      <div class="panel-body">
        <dl class="kv">
          <dt>Hourly cost of a team member</dt><dd>${usd(a.hourly_rate)}</dd>
          <dt>Minutes to check one AI draft</dt><dd>${num(a.review_draft, 1)}</dd>
          <dt>Extra minutes when a wrong answer reaches a customer</dt><dd>${num(a.failure_minutes, 1)}</dd>
          <dt>One-off setup cost</dt><dd>${usd(a.setup_cost_usd)}</dd>
          <dt>Test cases per step</dt><dd>${num(a.tasks_per_candidate)}</dd>
          <dt>Grading model</dt><dd><code>${modelName(a.judge_model)}</code></dd>
        </dl>
        ${(d.unpriced as string[]).length ? html`<div class="callout warn" style="margin-top:14px">${icon("TriangleAlert")}<span>No price is known for ${(d.unpriced as string[]).map(modelName).join(", ")}, so its cost counts as $0.</span></div>` : ""}
      </div>
    </div>`;
}

function audit(d: Row): Raw {
  return html`
    <div class="panel section">
      <div class="panel-head"><div><h2>Privacy and audit trail</h2>
        <p>Redacted case text was sent to ${(d.providers as string[]).join(", ") || "no one"}. Emails, phone numbers, card numbers and staff names are removed first; customer names in free text can slip through.</p></div></div>
      <div class="table-wrap"><table class="table">
        <thead><tr><th>Purpose</th><th>Model</th><th class="r">Calls</th><th class="r">Failed</th><th class="r">Cost</th></tr></thead>
        <tbody>${(d.calls as Row[]).map((c) => html`<tr>
          <td>${({ label: "Scoring steps", task: "Doing test cases", judge: "Grading written answers" } as Record<string, string>)[c.kind] || c.kind}</td>
          <td><code>${modelName(c.model)}</code></td><td class="r">${num(c.n)}</td><td class="r">${num(c.errors)}</td><td class="r">${usd(c.cost, 3)}</td></tr>`)}
        </tbody></table></div>
    </div>`;
}

// Component styles live here so the tab ships as one unit.
const css = raw(`
.headline .panel-body { display: grid; gap: 18px; padding: 22px 22px 18px; }
.headline-text { font-size: 19px; line-height: 1.45; letter-spacing: -0.01em; max-width: 62ch; color: var(--text); }
.headline-text strong { font-weight: 620; }
.facts { display: flex; flex-wrap: wrap; gap: 10px 36px; margin: 0; padding-top: 14px; border-top: 1px solid var(--border); }
.facts div { display: grid; gap: 2px; }
.facts dt { font-size: 12px; color: var(--text-3); }
.facts dd { margin: 0; font-weight: 550; }
.recs { display: grid; grid-template-columns: minmax(110px,1fr) 176px minmax(150px,1.1fr) 88px minmax(200px,1.7fr) 140px 32px; column-gap: 18px; }
.rec, .rec-head, .rec-main { grid-column: 1 / -1; display: grid; grid-template-columns: subgrid; }
.rec-head { align-items: end; padding: 10px 18px; background: var(--subtle); border-bottom: 1px solid var(--border); font-size: 12px; font-weight: 550; color: var(--text-3); }
.rec-head .r { text-align: right; }
.rec { border-top: 1px solid var(--border); }
.rec-head + .rec { border-top: 0; }
.rec-main { align-items: center; padding: 16px 18px; }
.rec-main > div { display: grid; gap: 2px; min-width: 0; justify-items: start; }
.rec-main > .rec-acc, .rec-main > .rec-value { justify-items: end; }
.rec-main > .rec-range { justify-items: stretch; }
.rec-detail { grid-column: 1 / -1; }
.rec .sub { color: var(--text-3); font-size: 12.5px; }
.rec-acc, .rec-value { text-align: right; }
.rec-toggle { justify-self: end; }
.axis { position: relative; height: 16px; margin-top: 4px; font-weight: 500; }
.axis span { position: absolute; top: 0; white-space: nowrap; }
.axis .zero { transform: translateX(-50%); }
.range { position: relative; height: 10px; border-radius: 6px; background: var(--hover); }
.range-zero { position: absolute; top: -4px; bottom: -4px; width: 1px; background: var(--border-strong); }
.range-span { position: absolute; top: 0; bottom: 0; border-radius: 6px; background: var(--c-soft); }
.range-point { position: absolute; top: 50%; width: 12px; height: 12px; margin: -6px 0 0 -6px; border-radius: 50%; background: var(--c); box-shadow: 0 0 0 2px var(--surface), var(--shadow-1); }
.range.automate { --c: var(--good); --c-soft: #b9e3cc; }
.range.review { --c: #c27a00; --c-soft: #f6d9a6; }
.range.dont_automate { --c: #7c838e; --c-soft: #dadde2; }
.range-text { margin-top: 6px; font-size: 12.5px; color: var(--text-3); }
.range-text strong { color: var(--text); font-weight: 600; margin-right: 4px; }
.rec-detail { padding: 0 18px 18px; display: grid; gap: 12px; }
.rec-detail .reason { color: var(--text-2); max-width: 90ch; }
[aria-expanded="true"] .ico { transform: rotate(180deg); }
.rec-toggle .ico { transition: transform 200ms var(--ease); }
.table.compact td, .table.compact th { padding: 8px 12px; }
.rec-detail .table-wrap { border: 1px solid var(--border); border-radius: var(--radius-sm); }
.plain-list { list-style: none; margin: 0; padding: 6px 18px; }
.plain-list li { display: flex; gap: 12px; padding: 12px 0; border-top: 1px solid var(--border); color: var(--text-3); }
.plain-list li:first-child { border-top: 0; }
.plain-list strong { color: var(--text); text-transform: capitalize; }
.plain-list p { margin-top: 2px; color: var(--text-2); }
.acc { display: inline-flex; align-items: center; gap: 8px; }
.acc-bar { width: 48px; height: 6px; border-radius: 4px; background: var(--hover); position: relative; overflow: hidden; }
.acc-bar::after { content: ""; position: absolute; inset: 0; width: calc(var(--v) * 100%); background: var(--accent); border-radius: 4px; }
.baseline .panel { min-width: 0; }
.assumed { margin-left: 6px; font-size: 11px; font-weight: 550; color: var(--accent); background: var(--accent-soft); padding: 1px 6px; border-radius: 999px; }
.flows { list-style: none; margin: 0; padding: 10px 18px 16px; display: grid; gap: 10px; }
.flows li { display: grid; grid-template-columns: minmax(0, 1fr) 90px 48px; gap: 12px; align-items: center; font-size: 13px; }
.flow-label { display: inline-flex; align-items: center; gap: 6px; color: var(--text-2); text-transform: capitalize; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
.flow-bar { height: 6px; border-radius: 4px; background: var(--hover); overflow: hidden; }
.flow-bar span { display: block; height: 100%; background: #8ea2f0; border-radius: 4px; }
.flow-n { text-align: right; color: var(--text-3); }
.kv { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 10px 16px; margin: 0; }
.kv dt { color: var(--text-2); }
.kv dd { margin: 0; text-align: right; font-weight: 550; font-variant-numeric: tabular-nums; }
@media (max-width: 1100px) {
  .recs { display: block; }
  .rec-head { display: none; }
  .rec { display: block; }
  .rec-main { grid-template-columns: minmax(0, 1fr) auto; gap: 12px 16px; position: relative; padding-right: 52px; }
  .rec-range { grid-column: 1 / -1; }
  .rec-acc, .rec-value { text-align: left; }
  .rec-toggle { position: absolute; top: 14px; right: 12px; }
}
@media (max-width: 600px) { .facts { display: grid; grid-template-columns: 1fr 1fr; } }
`);
if (!document.getElementById("results-css")) {
  const s = document.createElement("style");
  s.id = "results-css";
  s.textContent = css.value;
  document.head.append(s);
}
