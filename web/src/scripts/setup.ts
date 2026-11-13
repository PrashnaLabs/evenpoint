// Setup tab: data file, column mapping, steps, models and assumptions, saved to evenpoint.yaml.
import { api, upload, type Config, type Inspect } from "../lib/api";
import { $, $$, busy, html, icon, modelName, mount, num, raw, stepName, toast, type Raw } from "../lib/ui";
import type { Ctx } from "./project";
import { advancedRun, wireAdvancedRun } from "./run";

type Mapping = Record<string, any>;
const ADAPTER_LABEL: Record<string, string> = { zendesk: "Zendesk export", jira: "Jira export", csv: "CSV file", mbox: "Email (mbox)" };

export async function renderSetup(el: HTMLElement, ctx: Ctx) {
  let cfg: Config = structuredClone(ctx.project.config);
  cfg.sources ??= [];
  cfg.steps ??= {};
  cfg.bench ??= {};
  cfg.review_minutes ??= {};
  let info: Inspect | null = null;
  let dirty = false;
  let colsOpen = false;

  const source = () => cfg.sources[0] as { adapter: string; path: string; mapping: Mapping } | undefined;
  const fileName = () => source()?.path.split("/").pop() || "";

  if (source() && ctx.project.files.includes(fileName())) {
    try { info = await api<Inspect>(`/projects/${encodeURIComponent(ctx.name)}/inspect?file=${encodeURIComponent(fileName())}`); }
    catch { info = null; }
  }
  // Zendesk/Jira configs only store what differs from the adapter's defaults; show the full mapping.
  const s0 = source();
  if (s0 && info && (s0.adapter === "zendesk" || s0.adapter === "jira") && info.adapter === s0.adapter) {
    s0.mapping = { ...info.mapping, ...s0.mapping };
  }

  const setDirty = (v = true) => {
    dirty = v;
    el.dataset.dirty = String(v);
    $("#savebar", el)?.toggleAttribute("hidden", !v);
  };

  function draw() {
    mount(el, html`
      <div class="panel setup">
        ${dataSection()}
        ${source() ? columnsSection() : ""}
        ${source() ? stepsSection() : ""}
        ${modelsSection()}
        ${assumptionsSection()}
        ${advancedRun(ctx)}
      </div>
      ${deleteSection()}
      <div class="savebar" id="savebar" ${dirty ? "" : "hidden"}>
        <span>${icon("Info")}You have unsaved changes</span>
        <div class="row">
          <button class="btn ghost" type="button" id="discard">Discard</button>
          <button class="btn" type="button" id="save">Save</button>
          <button class="btn primary" type="button" id="save-run">${icon("Play")}Save and run</button>
        </div>
      </div>`);
    el.dataset.dirty = String(dirty);
    wire();
  }

  // ---------- sections
  function dataSection(): Raw {
    const s = source();
    return html`
      <div class="settings-row">
        <header><h2>Your data</h2><p>An export of your team's work: tickets, issues or emails. It stays in this project's folder.</p></header>
        <div class="stack">
          ${s ? html`
            <div class="file-card">
              <span class="file-icon">${icon(s.adapter === "mbox" ? "Mail" : "FileSpreadsheet")}</span>
              <div><strong>${fileName()}</strong>
                <div class="hint">${ADAPTER_LABEL[s.adapter]}${info?.row_count != null ? ` · ${num(info.row_count)} rows` : ""}</div></div>
              <label class="btn sm" for="file-input">${icon("Upload")}Replace</label>
            </div>
            ${info && info.rows.length ? preview(info) : ""}` : html`
            <label class="dropzone" for="file-input" id="dropzone">
              <span class="file-icon">${icon("Upload")}</span>
              <strong>Drop your export here, or choose a file</strong>
              <span class="hint">CSV from Zendesk, Jira or any tool · email .mbox · up to 1 GB</span>
            </label>`}
          <input type="file" id="file-input" accept=".csv,.mbox,.mbx,text/csv" hidden />
          <div class="upload-progress" id="upload-progress" hidden><span></span></div>
          ${sampleData()}
          ${ctx.project.files.length > 1 || (!s && ctx.project.files.length) ? html`
            <div class="field"><label for="existing">Or use a file already in this project</label>
              <select class="select" id="existing"><option value="">Choose…</option>
                ${ctx.project.files.map((f) => html`<option ${f === fileName() ? "selected" : ""}>${f}</option>`)}</select></div>` : ""}
        </div>
      </div>`;
  }

  /** Mock or real example datasets, loaded into this project with their column mapping and step settings. */
  function sampleData(): Raw {
    const ex = [...ctx.status.examples].sort((a, b) => Number(a.id.startsWith("github")) - Number(b.id.startsWith("github")));
    if (!ex.length) return html``;
    const inner = html`
      <div class="sample-data">
        ${ex.map((x) => html`
          <button class="sample-option" type="button" data-sample="${x.id}">
            <span class="sample-icon">${icon(x.id.startsWith("github") ? "Workflow" : "Sparkles", "sm")}</span>
            <span><strong>${x.title}</strong><span class="hint">${x.about}</span></span>
          </button>`)}
      </div>`;
    return source()
      ? html`<details class="sample-details"><summary>Use sample data instead</summary>${inner}</details>`
      : html`<div class="field"><span class="label">No export handy? Start with sample data</span>${inner}</div>`;
  }

  function preview(i: Inspect): Raw {
    const cols = i.headers.slice(0, 8);
    return html`
      <details class="preview">
        <summary>Preview first rows</summary>
        <div class="table-wrap"><table class="table compact">
          <thead><tr>${cols.map((h) => html`<th>${h}</th>`)}</tr></thead>
          <tbody>${i.rows.map((r) => html`<tr>${cols.map((h) => html`<td><span class="cell">${r[h]}</span></td>`)}</tr>`)}</tbody>
        </table></div>
        ${i.headers.length > cols.length ? html`<p class="hint">and ${i.headers.length - cols.length} more columns</p>` : ""}
      </details>`;
  }

  function columnsSection(): Raw {
    const s = source()!;
    const m = s.mapping;
    if (s.adapter === "mbox") {
      return html`
        <div class="settings-row">
          <header><h2>Who replies</h2><p>Messages from these addresses count as your team's replies; everything else is a customer.</p></header>
          <div class="field"><label for="team">Team addresses or domains</label>
            <input class="input" id="team" value="${(m.team || []).join(", ")}" placeholder="@yourcompany.com, support@yourcompany.com" />
            <span class="hint">Separate with commas. Start with @ to match a whole domain.</span></div>
        </div>`;
    }
    const headers = info?.headers || [];
    const long = "activity" in m;
    const opt = (sel?: string, blank = "") => html`${blank ? html`<option value="">${blank}</option>` : ""}${headers.map((h) => html`<option ${h === sel ? "selected" : ""}>${h}</option>`)}`;
    const stamps: Record<string, string> = m.timestamps || {};
    const stampCols = Array.from(new Set([...Object.values(stamps), ...(info?.timestamp_columns || [])]));
    const fields: Record<string, string> = m.fields || {};
    const fieldCols = headers.length ? headers.filter((h) => !stampCols.includes(h) && h !== m.case_id) : Object.values(fields);
    const nameFor = (col: string, map: Record<string, string>) => Object.entries(map).find(([, c]) => c === col)?.[0];
    const slug = (h: string) => h.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");

    if (!headers.length) {
      return html`
        <div class="settings-row">
          <header><h2>Columns</h2><p>This file lives outside the project folder, so its columns can't be previewed here.</p></header>
          <div class="callout info">${icon("Info")}<span>Using the mapping saved in <code>evenpoint.yaml</code>: case id <code>${m.case_id || "?"}</code>, ${Object.keys(stamps).length} steps, ${Object.keys(fields).length} fields.</span></div>
        </div>`;
    }
    return html`
      <div class="settings-row">
        <header><h2>Columns</h2><p>Which columns identify a case, mark each step, and hold text for the AI. Detected automatically.</p></header>
        <details class="cols" ${colsOpen ? "open" : ""}>
          <summary>${long ? "One row per event" : `${Object.keys(stamps).length} steps`} · ${Object.keys(fields).length} text fields · cases identified by ${m.case_id || "?"}<span class="cols-edit">Edit</span></summary>
        <div class="stack" style="margin-top:20px">
          <div class="segmented" role="radiogroup" aria-label="File layout">
            <label class="check"><input type="radio" name="layout" value="wide" ${long ? "" : "checked"} /><span><strong>One row per ticket</strong><span class="hint">Each step has its own date column</span></span></label>
            <label class="check"><input type="radio" name="layout" value="long" ${long ? "checked" : ""} /><span><strong>One row per event</strong><span class="hint">A step column and a time column</span></span></label>
          </div>
          <div class="grid-2">
            <div class="field"><label for="case-id">Case ID column</label><select class="select" id="case-id">${opt(m.case_id)}</select></div>
            <div class="field"><label for="actor">Who did the work <span class="muted">(optional)</span></label><select class="select" id="actor">${opt(m.actor, "Not in this file")}</select></div>
          </div>
          ${long ? html`
            <div class="grid-2">
              <div class="field"><label for="act-col">Step column</label><select class="select" id="act-col">${opt(m.activity)}</select></div>
              <div class="field"><label for="ts-col">Time column</label><select class="select" id="ts-col">${opt(m.ts)}</select></div>
            </div>` : html`
            <fieldset class="field">
              <legend class="label">Steps <span class="hint">Date columns found in your file. Each one ticked becomes a step.</span></legend>
              <div class="map-list">
                ${stampCols.length ? stampCols.map((col) => {
                  const n = nameFor(col, stamps);
                  return html`<div class="map-row" data-kind="stamp" data-col="${col}">
                    <label class="check"><input type="checkbox" ${n ? "checked" : ""} /><span class="col-name">${col}</span></label>
                    ${icon("ArrowRight", "sm")}
                    <input class="input" aria-label="Step name for ${col}" value="${n || slug(col).replace(/_?(at|date|time)$/, "")}" />
                  </div>`;
                }) : html`<p class="hint">No date columns detected. Switch to "one row per event", or check the file's date format.</p>`}
              </div>
            </fieldset>`}
          <fieldset class="field">
            <legend class="label">Fields to keep <span class="hint">Text and labels the AI can read, or be compared against. Everything else is ignored.</span></legend>
            <div class="map-list">
              ${fieldCols.map((col) => {
                const n = nameFor(col, fields);
                const kind = info?.text_columns?.includes(col) ? "text" : info?.label_columns?.includes(col) ? "label" : "";
                return html`<div class="map-row" data-kind="field" data-col="${col}">
                  <label class="check"><input type="checkbox" ${n ? "checked" : ""} /><span class="col-name">${col}</span>${kind ? html`<span class="badge outline">${kind}</span>` : ""}</label>
                  ${icon("ArrowRight", "sm")}
                  <input class="input" aria-label="Field name for ${col}" value="${n || slug(col)}" />
                </div>`;
              })}
            </div>
          </fieldset>
          <details class="advanced"><summary>Date format</summary>
            <div class="field" style="margin-top:10px"><label for="ts-format">Date format <span class="muted">(only if dates aren't ISO, e.g. 02/Jan/24 10:00 AM)</span></label>
              <input class="input mono" id="ts-format" value="${m.ts_format || ""}" placeholder="%d/%b/%y %I:%M %p" /></div>
          </details>
        </div>
        </details>
      </div>`;
  }

  function stepNames(): string[] {
    const m = source()?.mapping || {};
    if (source()?.adapter === "mbox") return ["customer_message", "team_reply"];
    return Array.from(new Set([...Object.keys(m.timestamps || {}), ...Object.keys(cfg.steps || {})]));
  }
  function fieldNames(): string[] {
    const m = source()?.mapping || {};
    if (source()?.adapter === "mbox") return ["subject", "text", "reply"];
    return Object.keys(m.fields || {});
  }

  function stepsSection(): Raw {
    const steps = stepNames();
    const fields = fieldNames();
    const fopt = (sel?: string) => html`<option value="">Choose…</option>${fields.map((f) => html`<option ${f === sel ? "selected" : ""}>${f}</option>`)}`;
    return html`
      <div class="settings-row">
        <header><h2>Steps</h2><p>How long each step takes a person, and how to test the AI on it. Leave a step on "Let Evenpoint decide" and a model will pick from your fields.</p></header>
        ${steps.length ? html`<div class="stack">
          <div class="table-wrap steps-table"><table class="table">
            <thead><tr><th>Step</th><th>Minutes of work</th><th>Test the AI by</th><th>AI reads</th><th>Compare with</th></tr></thead>
            <tbody>${steps.map((s) => {
              const o = cfg.steps[s] || {};
              const decide = !o.task_type;
              return html`<tr data-step="${s}">
                <td class="strong">${stepName(s)}</td>
                <td><input class="input num" style="width:76px" type="number" min="0" step="0.5" data-k="minutes" value="${o.minutes ?? ""}" placeholder="Measured" aria-label="Minutes of work for ${s}" /></td>
                <td><select class="select" data-k="task_type" aria-label="Test type for ${s}">
                  <option value="" ${decide ? "selected" : ""}>Let Evenpoint decide</option>
                  <option value="classify" ${o.task_type === "classify" ? "selected" : ""}>Picking a label</option>
                  <option value="extract" ${o.task_type === "extract" ? "selected" : ""}>Copying a value</option>
                  <option value="draft" ${o.task_type === "draft" ? "selected" : ""}>Writing a reply</option></select></td>
                <td><select class="select" data-k="input" ${decide ? "disabled" : ""} aria-label="Field the AI reads for ${s}">${fopt(o.input)}</select></td>
                <td><select class="select" data-k="expected" ${decide ? "disabled" : ""} aria-label="Field to compare with for ${s}">${fopt(o.expected)}</select></td>
              </tr>`;
            })}</tbody></table></div>
          <p class="hint">Left empty, minutes are measured from the time between events in your file, which includes waiting time. Enter real minutes where you know them.</p></div>` : html`
          <p class="hint">Steps appear here once you've picked step columns above${source() && "activity" in (source()!.mapping) ? ", or after the first run" : ""}.</p>`}
      </div>`;
  }

  function modelsSection(): Raw {
    const chosen = new Set<string>(cfg.models || []);
    const known = ctx.status.models;
    const custom = [...chosen].filter((m) => !known.some((k) => k.id === m));
    const price = (k: (typeof known)[number]) =>
      k.input_cost_per_token != null ? `$${(k.input_cost_per_token).toFixed(2)} in · $${(k.output_cost_per_token ?? 0).toFixed(2)} out per 1M tokens` : "Price unknown";
    const sel = (id: string, v: string) => html`<select class="select" id="${id}">${[...known.map((k) => k.id), ...custom].map((m) => html`<option value="${m}" ${m === v ? "selected" : ""}>${modelName(m)}</option>`)}</select>`;
    return html`
      <div class="settings-row">
        <header><h2>Models to test</h2><p>Each model does the same past cases. Testing two or three shows the trade-off between cost and quality.</p></header>
        <div class="stack">
          <div class="model-list">
            ${known.map((k) => html`
              <label class="model-option">
                <input type="checkbox" name="model" value="${k.id}" ${chosen.has(k.id) ? "checked" : ""} />
                <span><strong><code>${modelName(k.id)}</code></strong><span class="hint">${k.about}</span></span>
                <span class="hint num">${price(k)}</span>
              </label>`)}
            ${custom.map((m) => html`<label class="model-option"><input type="checkbox" name="model" value="${m}" checked /><span><strong><code>${m}</code></strong><span class="hint">Custom model</span></span><span></span></label>`)}
          </div>
          <div class="row add-model">
            <input class="input mono" id="custom-model" placeholder="Another model, e.g. openai/gpt-5.4-pro" style="max-width:340px" />
            <button class="btn" type="button" id="add-model">${icon("Plus")}Add</button>
          </div>
          <div class="grid-2">
            <div class="field"><label for="labeler">Model that scores steps</label>${sel("labeler", cfg.labeler_model)}<span class="hint">Reads a sample and rates how repetitive and risky each step is.</span></div>
            <div class="field"><label for="judge">Model that grades written replies</label>${sel("judge", cfg.judge_model)}<span class="hint">Compares AI replies with your team's. A stronger model grades more reliably.</span></div>
          </div>
        </div>
      </div>`;
  }

  function assumptionsSection(): Raw {
    const f = (id: string, label: string, value: unknown, hint: string, pre = "", suf = "", step = "1") => html`
      <div class="field"><label for="${id}">${label}</label>
        <div class="input-affix">${pre ? html`<span class="affix">${pre}</span>` : ""}<input class="input num" type="number" min="0" step="${step}" id="${id}" value="${value ?? ""}" />${suf ? html`<span class="affix">${suf}</span>` : ""}</div>
        <span class="hint">${hint}</span></div>`;
    return html`
      <div class="settings-row">
        <header><h2>Assumptions</h2><p>These turn test results into hours and money. They're shown next to every result so anyone can check them.</p></header>
        <div class="grid-2">
          ${f("hourly_rate", "Hourly cost of a team member", cfg.hourly_rate, "Salary plus overheads, per hour.", "$", "/ hour")}
          ${f("setup_cost", "One-off setup cost", cfg.setup_cost_usd, "Time and tools to put an automation live.", "$")}
          ${f("review_draft", "Minutes to check one AI draft", cfg.review_minutes.draft_review, "When a person approves every AI output.", "", "min", "0.5")}
          ${f("failure", "Extra minutes when a wrong answer reaches a customer", cfg.failure_minutes, "Follow-ups and apologies, on top of redoing the work.", "", "min", "0.5")}
          ${f("tasks", "Test cases per step", cfg.bench.tasks_per_candidate, "More cases give narrower ranges and cost more.", "", "cases")}
          ${f("max_cost", "Ask before spending more than", cfg.bench.max_cost_usd, "Evenpoint shows the estimate and waits for you above this.", "$", "", "0.5")}
          ${f("min_volume", "Ignore steps rarer than", cfg.min_volume_per_month ?? 20, "Cases per month.", "", "/ month")}
          ${f("max_candidates", "Test at most", cfg.max_candidates ?? 5, "The highest-potential steps are tested first.", "", "steps")}
        </div>
      </div>`;
  }

  function deleteSection(): Raw {
    return html`
      <div class="panel danger-zone">
        <div class="settings-row">
          <header><h2>Delete this project</h2><p>Removes the project folder from this computer: uploaded exports, test results, grades and reports. This can't be undone.</p></header>
          <form class="stack" id="delete-form" autocomplete="off">
            <div class="field"><label for="delete-confirm">Type <code>${ctx.name}</code> to confirm</label>
              <input class="input" id="delete-confirm" spellcheck="false" data-ignore-dirty /></div>
            <div><button class="btn danger" type="submit" id="delete-btn" disabled>${icon("X")}Delete project</button></div>
          </form>
        </div>
      </div>`;
  }

  // ---------- read form back into cfg
  function collect() {
    const s = source();
    if (s && s.adapter === "mbox") {
      const t = $<HTMLInputElement>("#team", el);
      if (t) s.mapping.team = t.value.split(",").map((x) => x.trim()).filter(Boolean);
    } else if (s && info?.headers.length) {
      const m: Mapping = { case_id: $<HTMLSelectElement>("#case-id", el)!.value };
      const actor = $<HTMLSelectElement>("#actor", el)!.value;
      if (actor) m.actor = actor;
      const layout = $<HTMLInputElement>("input[name=layout]:checked", el)!.value;
      if (layout === "long") {
        m.activity = $<HTMLSelectElement>("#act-col", el)?.value || info.headers[0];
        m.ts = $<HTMLSelectElement>("#ts-col", el)?.value || info.headers[0];
      } else {
        m.timestamps = {};
        $$(".map-row[data-kind=stamp]", el).forEach((r) => {
          const on = $<HTMLInputElement>("input[type=checkbox]", r)!.checked;
          const n = $<HTMLInputElement>("input.input", r)!.value.trim();
          if (on && n) m.timestamps[n] = r.dataset.col;
        });
      }
      m.fields = {};
      $$(".map-row[data-kind=field]", el).forEach((r) => {
        const on = $<HTMLInputElement>("input[type=checkbox]", r)!.checked;
        const n = $<HTMLInputElement>("input.input", r)!.value.trim();
        if (on && n) m.fields[n] = r.dataset.col;
      });
      const fmt = $<HTMLInputElement>("#ts-format", el)?.value.trim();
      if (fmt) m.ts_format = fmt;
      s.mapping = m;
    }
    const steps: Config = {};
    $$("tr[data-step]", el).forEach((tr) => {
      const o: Record<string, unknown> = {};
      const v = (k: string) => $<HTMLInputElement>(`[data-k=${k}]`, tr)!.value;
      if (v("minutes") !== "") o.minutes = Number(v("minutes"));
      if (v("task_type")) {
        o.task_type = v("task_type");
        if (v("input")) o.input = v("input");
        if (v("expected")) o.expected = v("expected");
      }
      if (Object.keys(o).length) steps[tr.dataset.step!] = o;
    });
    if (s) cfg.steps = steps;
    cfg.models = $$<HTMLInputElement>("input[name=model]:checked", el).map((i) => i.value);
    cfg.labeler_model = $<HTMLSelectElement>("#labeler", el)!.value;
    cfg.judge_model = $<HTMLSelectElement>("#judge", el)!.value;
    const n = (id: string) => Number($<HTMLInputElement>(`#${id}`, el)!.value || 0);
    cfg.hourly_rate = n("hourly_rate");
    cfg.setup_cost_usd = n("setup_cost");
    cfg.review_minutes = { ...cfg.review_minutes, auto: cfg.review_minutes.auto ?? 0, draft_review: n("review_draft") };
    cfg.failure_minutes = n("failure");
    cfg.bench = { ...cfg.bench, tasks_per_candidate: Math.max(1, Math.round(n("tasks"))), max_cost_usd: n("max_cost") };
    cfg.min_volume_per_month = n("min_volume");
    cfg.max_candidates = Math.max(1, Math.round(n("max_candidates")));
  }

  function validate(): string | null {
    const s = source();
    if (!s) return "Add your data file first.";
    if (!cfg.models?.length) return "Pick at least one model to test.";
    if (s.adapter === "mbox") return s.mapping.team?.length ? null : "Add at least one team address or domain.";
    if (info?.headers.length) {
      const m = s.mapping;
      if (!m.case_id) return "Choose the case ID column.";
      if (!("activity" in m) && !Object.keys(m.timestamps || {}).length) return "Tick at least one date column as a step.";
      if (!Object.keys(m.fields || {}).length) return "Keep at least one text field so the AI has something to read.";
    }
    return null;
  }

  async function save(run = false) {
    collect();
    const problem = validate();
    if (problem) return toast(problem, "error");
    const btn = $<HTMLButtonElement>(run ? "#save-run" : "#save", el);
    busy(btn, true, "Saving");
    try {
      await api(`/projects/${encodeURIComponent(ctx.name)}/config`, { method: "PUT", body: cfg });
      setDirty(false);
      await ctx.reload();
      cfg = structuredClone(ctx.project.config);
      toast("Setup saved.");
      if (run) return ctx.startRun();
      draw();
    } catch (err) {
      toast((err as Error).message, "error");
      busy(btn, false);
    }
  }

  async function useFile(i: Inspect) {
    info = i;
    const mapping = i.adapter === "csv" || i.adapter === "mbox" ? i.mapping : structuredClone(i.mapping);
    cfg.sources = [{ adapter: i.adapter, path: `exports/${i.file}`, mapping }];
    if (i.adapter !== "mbox") {
      const stamps = Object.keys(mapping.timestamps || {});
      cfg.steps = Object.fromEntries(Object.entries(cfg.steps || {}).filter(([k]) => stamps.includes(k)));
      if (stamps[0] && !cfg.steps[stamps[0]]) cfg.steps[stamps[0]] = { minutes: 0 };
    }
    if (!ctx.project.files.includes(i.file)) ctx.project.files.push(i.file);
    setDirty(true);
    draw();
  }

  async function loadSample(btn: HTMLButtonElement) {
    btn.setAttribute("aria-busy", "true");
    try {
      const r = await api<{ inspect: Inspect; source: { adapter: string; path: string; mapping: Mapping }; steps: Config }>(
        `/projects/${encodeURIComponent(ctx.name)}/sample-data`, { method: "POST", body: { example: btn.dataset.sample } });
      info = r.inspect;
      const s = { ...r.source, mapping: r.source.mapping || {} };
      if ((s.adapter === "zendesk" || s.adapter === "jira") && info.adapter === s.adapter) s.mapping = { ...info.mapping, ...s.mapping };
      cfg.sources = [s];
      cfg.steps = structuredClone(r.steps);
      const f = s.path.split("/").pop()!;
      if (!ctx.project.files.includes(f)) ctx.project.files.push(f);
      toast(`Loaded ${f}${info.row_count != null ? ` · ${num(info.row_count)} rows` : ""}. Check the settings, then save.`);
      setDirty(true);
      draw();
    } catch (err) {
      toast((err as Error).message, "error");
      btn.removeAttribute("aria-busy");
    }
  }

  async function handleFile(file: File) {
    const bar = $("#upload-progress", el)!;
    bar.hidden = false;
    try {
      const i = await upload(ctx.name, file, (p) => ((bar.firstElementChild as HTMLElement).style.transform = `scaleX(${p})`));
      toast(`${i.file} uploaded${i.row_count != null ? ` · ${num(i.row_count)} rows` : ""}.`);
      await useFile(i);
    } catch (err) {
      bar.hidden = true;
      toast((err as Error).message, "error");
    }
  }

  function wire() {
    const cols = $<HTMLDetailsElement>("details.cols", el);
    cols?.addEventListener("toggle", () => (colsOpen = cols.open));
    wireAdvancedRun(el, ctx);
    const input = $<HTMLInputElement>("#file-input", el)!;
    input.addEventListener("change", () => input.files?.[0] && handleFile(input.files[0]));
    const dz = $("#dropzone", el);
    if (dz) {
      ["dragenter", "dragover"].forEach((t) => dz.addEventListener(t, (e) => { e.preventDefault(); dz.classList.add("over"); }));
      ["dragleave", "drop"].forEach((t) => dz.addEventListener(t, () => dz.classList.remove("over")));
      dz.addEventListener("drop", (e) => {
        e.preventDefault();
        const f = (e as DragEvent).dataTransfer?.files[0];
        if (f) handleFile(f);
      });
    }
    $$<HTMLButtonElement>("[data-sample]", el).forEach((b) => b.addEventListener("click", () => loadSample(b)));
    $<HTMLSelectElement>("#existing", el)?.addEventListener("change", async (e) => {
      const f = (e.target as HTMLSelectElement).value;
      if (!f) return;
      try { await useFile(await api<Inspect>(`/projects/${encodeURIComponent(ctx.name)}/inspect?file=${encodeURIComponent(f)}`)); }
      catch (err) { toast((err as Error).message, "error"); }
    });
    $$<HTMLInputElement>("input[name=layout]", el).forEach((r) => r.addEventListener("change", () => {
      collect();
      const m = source()!.mapping;
      if (r.value === "long") {
        delete m.timestamps;
        m.activity = info?.headers[0];
        m.ts = info?.timestamp_columns?.[0] || info?.headers[0];
      } else {
        delete m.activity;
        delete m.ts;
        m.timestamps = info?.mapping.timestamps || {};
      }
      setDirty(true);
      draw();
    }));
    // Re-render steps when step columns change, so the steps table follows.
    $$(".map-row[data-kind=stamp] input, .map-row[data-kind=field] input", el).forEach((i) =>
      i.addEventListener("change", () => { collect(); setDirty(true); draw(); }));
    $$<HTMLSelectElement>("[data-k=task_type]", el).forEach((s) => s.addEventListener("change", () => {
      const tr = s.closest("tr")!;
      $$<HTMLSelectElement>("[data-k=input], [data-k=expected]", tr).forEach((x) => (x.disabled = !s.value));
    }));
    $("#add-model", el)?.addEventListener("click", () => {
      const v = $<HTMLInputElement>("#custom-model", el)!.value.trim();
      if (!v) return;
      collect();
      if (!cfg.models.includes(v)) cfg.models.push(v);
      setDirty(true);
      draw();
    });
    const confirmInput = $<HTMLInputElement>("#delete-confirm", el)!;
    const deleteBtn = $<HTMLButtonElement>("#delete-btn", el)!;
    confirmInput.addEventListener("input", () => (deleteBtn.disabled = confirmInput.value.trim() !== ctx.name));
    $("#delete-form", el)!.addEventListener("submit", async (e) => {
      e.preventDefault();
      if (confirmInput.value.trim() !== ctx.name) return;
      busy(deleteBtn, true, "Deleting");
      try {
        await api(`/projects/${encodeURIComponent(ctx.name)}`, { method: "DELETE", body: { confirm: ctx.name } });
        el.dataset.dirty = "false";
        location.href = "/?deleted=" + encodeURIComponent(ctx.name);
      } catch (err) {
        toast((err as Error).message, "error");
        busy(deleteBtn, false);
      }
    });
    $("#save", el)?.addEventListener("click", () => save(false));
    $("#save-run", el)?.addEventListener("click", () => save(true));
    $("#discard", el)?.addEventListener("click", () => {
      cfg = structuredClone(ctx.project.config);
      setDirty(false);
      draw();
    });
  }

  // Any edit marks the form dirty (listeners live on the tab root, which survives redraws).
  const counts = (e: Event) => !(e.target as HTMLElement).closest("[data-ignore-dirty], #delete-form, #advanced");
  el.oninput = (e) => counts(e) && setDirty(true);
  el.onchange = (e) => {
    const id = (e.target as HTMLElement).id;
    if (counts(e) && id !== "file-input" && id !== "existing") setDirty(true);
  };
  draw();
}

const css = raw(`
.cols > summary { display: flex; width: 100%; padding: 12px 14px; border: 1px solid var(--border); border-radius: var(--radius-sm); color: var(--text-2); font-size: 14px; }
.cols > summary:hover { border-color: var(--border-strong); }
.cols-edit { margin-left: auto; color: var(--accent); font-weight: 600; }
.cols[open] .cols-edit { display: none; }
.file-card { display: flex; align-items: center; gap: 12px; padding: 12px 14px; border: 1px solid var(--border); border-radius: var(--radius); background: var(--subtle); }
.file-card > div { flex: 1; min-width: 0; }
.file-card strong { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.file-icon { width: 36px; height: 36px; border-radius: 8px; display: grid; place-items: center; background: var(--surface); border: 1px solid var(--border); color: var(--accent); flex: none; }
.dropzone { display: grid; justify-items: center; gap: 6px; text-align: center; padding: 34px 20px; border: 1.5px dashed var(--border-strong); border-radius: var(--radius); background: var(--subtle); cursor: pointer; transition: border-color 150ms, background 150ms; }
.dropzone:hover, .dropzone.over { border-color: var(--accent); background: var(--accent-soft); }
.dropzone .file-icon { margin-bottom: 4px; }
.sample-data { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 8px; }
.sample-details .sample-data { margin-top: 10px; }
.sample-details summary { color: var(--text-2); font-weight: 500; font-size: 13px; }
.sample-option { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 10px; align-items: start; padding: 10px 12px; border: 1px solid var(--border); border-radius: var(--radius-sm); background: var(--surface); font: inherit; color: var(--text); text-align: left; cursor: pointer; transition: border-color 120ms, background 120ms; }
.sample-option:hover { border-color: var(--accent); background: var(--accent-soft); }
.sample-option[aria-busy="true"] { opacity: 0.6; pointer-events: none; }
.sample-option > span:last-child { display: grid; gap: 2px; }
.sample-option strong { font-weight: 550; }
.sample-icon { width: 26px; height: 26px; border-radius: var(--radius-sm); display: grid; place-items: center; background: var(--accent-soft); color: var(--accent); }
.upload-progress { height: 4px; border-radius: 8px; background: var(--hover); overflow: hidden; }
.upload-progress span { display: block; height: 100%; background: var(--accent); transform: scaleX(0); transform-origin: left; transition: transform 160ms; }
.preview summary, .advanced summary { cursor: pointer; color: var(--text-2); font-weight: 500; font-size: 13px; }
.preview .table-wrap { margin-top: 10px; border: 1px solid var(--border); border-radius: var(--radius-sm); max-height: 260px; }
.preview .cell { display: block; max-width: 220px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--text-2); }
.segmented { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.segmented .check { align-items: flex-start; padding: 10px 12px; border: 1px solid var(--border); border-radius: var(--radius-sm); }
.segmented .check:has(input:checked) { border-color: var(--accent); background: var(--accent-soft); }
.segmented .check > span { display: grid; gap: 1px; }
.segmented input { margin-top: 2px; }
fieldset.field { border: 0; padding: 0; margin: 0; min-width: 0; }
fieldset.field legend { display: grid; gap: 2px; margin-bottom: 6px; padding: 0; }
.map-list { display: grid; border: 1px solid var(--border); border-radius: var(--radius-sm); max-height: 340px; overflow: auto; }
.map-row { display: grid; grid-template-columns: minmax(0, 1fr) 16px minmax(0, 0.8fr); gap: 10px; align-items: center; padding: 7px 10px; border-top: 1px solid var(--border); color: var(--text-3); }
.map-row:first-child { border-top: 0; }
.map-row .check { min-width: 0; color: var(--text); }
.map-row .col-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.map-row .input { height: 30px; font-size: 13px; }
.map-row:has(input[type=checkbox]:not(:checked)) .input { opacity: 0.5; }
.steps-table { border: 1px solid var(--border); border-radius: var(--radius-sm); }
.steps-table td { padding: 8px 12px; }
.steps-table th { padding: 9px 12px; }
.steps-table .select, .steps-table .input { height: 36px; font-size: 14px; }
.steps-table .select { min-width: 128px; }
.model-list { display: grid; border: 1px solid var(--border); border-radius: var(--radius-sm); }
.model-option { display: grid; grid-template-columns: 16px minmax(0, 1fr) auto; gap: 12px; align-items: center; padding: 11px 12px; border-top: 1px solid var(--border); cursor: pointer; }
.model-option:first-child { border-top: 0; }
.model-option:hover { background: var(--subtle); }
.model-option input { accent-color: var(--accent); width: 16px; height: 16px; }
.model-option > span:nth-child(2) { display: grid; gap: 1px; }
.danger-zone { border-color: color-mix(in srgb, var(--bad) 25%, var(--surface)); }
.danger-zone h2 { color: var(--bad); }
.danger-zone .btn.danger:not([disabled]) { --b: var(--bad); --c: #fff; --bd: var(--bad); }
.danger-zone .btn.danger:not([disabled]):hover { --b: #9a1d14; --bd: #9a1d14; }
.savebar { position: sticky; bottom: 16px; margin-top: 16px; display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 10px 12px 10px 16px; background: var(--text); color: #fff; border-radius: var(--radius); box-shadow: var(--shadow-3); animation: toast-in 240ms var(--ease); }
.savebar > span { display: inline-flex; gap: 8px; align-items: center; font-weight: 500; }
.savebar .btn.ghost { color: var(--border-strong); }
.savebar .btn.ghost:hover { background: rgb(255 255 255 / 0.08); color: #fff; }
@media (max-width: 900px) { .segmented { grid-template-columns: 1fr; } .savebar { flex-direction: column; align-items: stretch; } }
`);
if (!document.getElementById("setup-css")) {
  const s = document.createElement("style");
  s.id = "setup-css";
  s.textContent = css.value;
  document.head.append(s);
}
