// Guided start: add data → check what Evenpoint found → set two basics and run.
// Every choice has a working default, so a first run takes a file and three clicks.
import { api, upload, type Config, type Inspect, type Job, type Project, type ProjectSummary, type Status } from "../lib/api";
import { $, $$, busy, dateShort, html, icon, mount, num, raw, stepName, toast, type Raw } from "../lib/ui";

type Mapping = Record<string, any>;
type Source = { adapter: string; path: string; mapping: Mapping };

const params = new URLSearchParams(location.search);
let step = Number(params.get("step") || 1);
let name = params.get("p") || "";
let status: Status;
let cfg: Config = {};
let info: Inspect | null = null;

const STEPS = ["Add your data", "Check what we found", "Set the basics and run"];

function go(n: number) {
  step = n;
  const url = new URL(location.href);
  url.searchParams.set("step", String(n));
  if (name) url.searchParams.set("p", name);
  history.replaceState(null, "", url);
  draw();
  window.scrollTo({ top: 0 });
}

function draw() {
  mount($("#steps")!, html`${STEPS.map((label, i) => {
    const n = i + 1;
    const state = n < step ? "done" : n === step ? "current" : "todo";
    return html`<li class="${state}" ${n === step ? raw('aria-current="step"') : ""}>
      <span class="step-dot">${n < step ? icon("Check", "sm") : n}</span><span>${label}</span></li>`;
  })}`);
  const el = $("#step")!;
  if (step === 1) return stepData(el);
  if (!info || !cfg.sources?.length) return go(1);
  if (step === 2) return stepCheck(el);
  return stepBasics(el);
}

// ---------------------------------------------------------------- step 1
function stepData(el: HTMLElement) {
  const examples = [...status.examples].sort((a, b) => Number(a.id.startsWith("github")) - Number(b.id.startsWith("github")));
  mount(el, html`
    <header class="start-head">
      <h1>What work should AI take on?</h1>
      <p>Add an export of your team's tickets, issues or emails. Evenpoint measures how the work flows today, tests AI models on real past cases, and tells you what's worth automating. Takes about five minutes.</p>
    </header>
    <label class="drop" for="file" id="drop">
      <span class="drop-icon">${icon("Upload", "lg")}</span>
      <strong>Drop your export here</strong>
      <span class="muted">or <span class="link">choose a file</span> · CSV from Zendesk, Jira or any tool, or an email .mbox</span>
      <span class="drop-progress" id="progress" hidden><span></span></span>
    </label>
    <input type="file" id="file" accept=".csv,.mbox,.mbx,text/csv" hidden />
    <p class="privacy">${icon("KeyRound", "sm")}Your file stays on this computer. Only redacted text from a sample of cases is sent to the AI model you choose.</p>
    ${examples.length ? html`
      <div class="or"><span>or try it with sample data</span></div>
      <div class="samples">
        ${examples.map((x) => html`
          <button class="sample" type="button" data-sample="${x.id}">
            <span class="sample-icon">${icon(x.id.startsWith("github") ? "Workflow" : "Sparkles")}</span>
            <span><strong>${x.title}</strong><span class="muted">${x.about}</span></span>
            ${icon("ArrowRight")}
          </button>`)}
      </div>` : ""}`);

  const input = $<HTMLInputElement>("#file")!;
  input.addEventListener("change", () => input.files?.[0] && addFile(input.files[0]));
  const drop = $("#drop")!;
  ["dragenter", "dragover"].forEach((t) => drop.addEventListener(t, (e) => { e.preventDefault(); drop.classList.add("over"); }));
  ["dragleave", "drop"].forEach((t) => drop.addEventListener(t, () => drop.classList.remove("over")));
  drop.addEventListener("drop", (e) => {
    e.preventDefault();
    const f = (e as DragEvent).dataTransfer?.files[0];
    if (f) addFile(f);
  });
  $$<HTMLButtonElement>("[data-sample]").forEach((b) => b.addEventListener("click", () => addSample(b)));
}

async function ensureProject(base: string): Promise<string> {
  if (name) return name;
  const p = await api<ProjectSummary>("/projects", { method: "POST", body: { name: base || "analysis", unique: true } });
  name = p.name;
  return name;
}

async function loadConfig() {
  const p = await api<Project>(`/projects/${encodeURIComponent(name)}`);
  cfg = structuredClone(p.config);
  cfg.steps ??= {};
}

async function addFile(file: File) {
  const drop = $("#drop")!;
  drop.classList.add("busy");
  const bar = $("#progress")!;
  bar.hidden = false;
  try {
    await ensureProject(file.name.replace(/\.[^.]+$/, ""));
    await loadConfig();
    info = await upload(name, file, (p) => ((bar.firstElementChild as HTMLElement).style.transform = `scaleX(${p})`));
    const mapping = structuredClone(info.mapping);
    cfg.sources = [{ adapter: info.adapter, path: `exports/${info.file}`, mapping }];
    const stamps = Object.keys(mapping.timestamps || {});
    cfg.steps = stamps[0] ? { [stamps[0]]: { minutes: 0 } } : {};
    go(2);
  } catch (err) {
    drop.classList.remove("busy");
    bar.hidden = true;
    toast((err as Error).message, "error");
  }
}

async function addSample(btn: HTMLButtonElement) {
  btn.setAttribute("aria-busy", "true");
  try {
    const title = status.examples.find((x) => x.id === btn.dataset.sample)?.title || "sample";
    await ensureProject(title);
    await loadConfig();
    const r = await api<{ inspect: Inspect; source: Source; steps: Config }>(
      `/projects/${encodeURIComponent(name)}/sample-data`, { method: "POST", body: { example: btn.dataset.sample } });
    info = r.inspect;
    const s = { ...r.source, mapping: r.source.mapping || {} };
    if ((s.adapter === "zendesk" || s.adapter === "jira") && info.adapter === s.adapter) s.mapping = { ...info.mapping, ...s.mapping };
    cfg.sources = [s];
    cfg.steps = structuredClone(r.steps);
    go(2);
  } catch (err) {
    btn.removeAttribute("aria-busy");
    toast((err as Error).message, "error");
  }
}

// ---------------------------------------------------------------- step 2
const source = () => cfg.sources[0] as Source;

function stepCheck(el: HTMLElement) {
  const s = source();
  const m = s.mapping;
  const i = info!;
  const unit = s.adapter === "jira" ? "issues" : s.adapter === "mbox" ? "email threads" : "cases";

  if (s.adapter === "mbox") {
    mount(el, html`
      <header class="start-head"><h1>Who on your team replies?</h1>
        <p>Messages from these addresses are your team's replies; everything else is a customer.</p></header>
      <div class="panel"><div class="panel-body stack">
        <div class="field"><label for="team">Team addresses or domains</label>
          <input class="input" id="team" value="${(m.team || []).join(", ")}" placeholder="@yourcompany.com" autofocus />
          <span class="hint">Separate with commas. Start with @ to match a whole domain.</span></div>
      </div></div>
      ${nav("Continue")}`);
    wireNav(() => {
      m.team = $<HTMLInputElement>("#team")!.value.split(",").map((x) => x.trim()).filter(Boolean);
      if (!m.team.length) return "Add at least one address or domain.";
    });
    return;
  }

  const stamps: Record<string, string> = m.timestamps || {};
  const stampCols = Array.from(new Set([...Object.values(stamps), ...(i.timestamp_columns || [])]));
  const fields: Record<string, string> = m.fields || {};
  const fieldCols = i.headers.filter((h) => !stampCols.includes(h) && h !== m.case_id);
  const nameFor = (col: string, map: Record<string, string>) => Object.entries(map).find(([, c]) => c === col)?.[0];
  const slug = (h: string) => h.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
  const kind = (h: string) => (i.text_columns?.includes(h) ? "Text" : i.label_columns?.includes(h) ? "Label" : "");
  const counts = i.timestamp_counts || {};
  const long = "activity" in m;

  mount(el, html`
    <header class="start-head">
      <h1>Here's what we found</h1>
      <p><strong>${num(i.row_count ?? 0)} ${unit}</strong>${i.first_date ? html` from ${dateShort(i.first_date)} to ${dateShort(i.last_date)}` : ""} in <code>${i.file}</code>. Untick anything that's wrong; you can fine-tune all of this later in Settings.</p>
    </header>

    ${long || !stampCols.length ? html`
      <div class="callout warn">${icon("TriangleAlert")}<div class="callout-body">
        <strong>We couldn't find date columns for the steps of your workflow.</strong>
        <span>If your file has one row per event, or dates in an unusual format, finish setup in Settings.</span>
        <div><a class="btn sm" href="/project/?p=${encodeURIComponent(name)}&tab=setup">Open Settings</a></div></div></div>` : html`
    <div class="panel found">
      <div class="panel-head"><div><h2>The steps of your workflow</h2><p>Each date column marks when a step happened. Evenpoint measures volume and timing for each one.</p></div></div>
      <ol class="flow">
        ${stampCols.map((col) => {
          const n = nameFor(col, stamps);
          return html`<li>
            <label class="check flow-step ${n ? "" : "off"}">
              <input type="checkbox" data-stamp="${col}" ${n ? "checked" : ""} />
              <span><strong>${stepName(n || slug(col).replace(/_?(at|date|time)$/, ""))}</strong>
                <span class="muted">${col} · ${num(counts[col] ?? 0)} ${unit}</span></span>
            </label></li>`;
        })}
      </ol>
    </div>`}

    <div class="panel found">
      <div class="panel-head"><div><h2>What the AI can read and be compared with</h2><p>Text a person read, and the answer or label they produced. Everything else is ignored.</p></div></div>
      <div class="chips">
        ${fieldCols.map((col) => {
          const n = nameFor(col, fields);
          return html`<label class="chip ${n ? "on" : ""}"><input type="checkbox" data-field="${col}" ${n ? "checked" : ""} />${n ? icon("Check", "sm") : icon("Plus", "sm")}${col}${kind(col) ? html`<span class="chip-kind">${kind(col)}</span>` : ""}</label>`;
        })}
      </div>
      <div class="panel-foot found-foot">
        <label for="case-id" class="muted">Each ${unit.replace(/s$/, "")} is identified by</label>
        <select class="select" id="case-id" style="width:auto">${i.headers.map((h) => html`<option ${h === m.case_id ? "selected" : ""}>${h}</option>`)}</select>
      </div>
    </div>
    ${nav("This looks right")}`);

  // Live toggle styling.
  $$<HTMLInputElement>("[data-field]").forEach((c) => c.addEventListener("change", () => {
    c.closest(".chip")!.classList.toggle("on", c.checked);
    c.closest(".chip")!.querySelector(".ico")!.outerHTML = icon(c.checked ? "Check" : "Plus", "sm").value;
  }));
  $$<HTMLInputElement>("[data-stamp]").forEach((c) => c.addEventListener("change", () => c.closest(".flow-step")!.classList.toggle("off", !c.checked)));

  wireNav(() => {
    m.case_id = $<HTMLSelectElement>("#case-id")!.value;
    if (!long && stampCols.length) {
      const next: Record<string, string> = {};
      $$<HTMLInputElement>("[data-stamp]").forEach((c) => {
        if (!c.checked) return;
        const col = c.dataset.stamp!;
        next[nameFor(col, stamps) || slug(col).replace(/_?(at|date|time)$/, "") || slug(col)] = col;
      });
      if (!Object.keys(next).length) return "Keep at least one step.";
      m.timestamps = next;
      cfg.steps = Object.fromEntries(Object.entries(cfg.steps || {}).filter(([k]) => k in next));
    }
    const f: Record<string, string> = {};
    $$<HTMLInputElement>("[data-field]").forEach((c) => {
      if (c.checked) f[nameFor(c.dataset.field!, fields) || slug(c.dataset.field!)] = c.dataset.field!;
    });
    if (!Object.keys(f).length) return "Keep at least one text field so the AI has something to read.";
    m.fields = f;
  });
}

// ---------------------------------------------------------------- step 3
function stepBasics(el: HTMLElement) {
  const s = source();
  const steps = s.adapter === "mbox" ? ["customer_message", "team_reply"] : Object.keys(s.mapping.timestamps || {});
  const chosen = new Set<string>(cfg.models || []);
  const modelNames = [...chosen].map((m) => m.replace(/^openai\//, "")).join(" and ");
  mount(el, html`
    <header class="start-head">
      <h1>Two numbers, then you're done</h1>
      <p>These turn test results into hours and money. Rough guesses are fine; every result shows them, and you can change them later without re-testing.</p>
    </header>

    <div class="panel">
      <div class="settings-row">
        <header><h2>What an hour of your team's time costs</h2><p>Salary plus overheads. If unsure, use about 1.4 × hourly pay.</p></header>
        <div class="input-affix" style="max-width:240px"><span class="affix">$</span><input class="input num" type="number" min="1" id="rate" value="${cfg.hourly_rate ?? 35}" /><span class="affix">/ hour</span></div>
      </div>
      <div class="settings-row">
        <header><h2>Minutes a person spends on each step</h2><p>Hands-on time, not waiting time. Leave a step blank and Evenpoint estimates it from your timestamps.</p></header>
        <div class="minutes">
          ${steps.map((st) => html`
            <label class="minute-row"><span>${stepName(st)}</span>
              <span class="input-affix"><input class="input num" type="number" min="0" step="0.5" data-step="${st}" value="${cfg.steps?.[st]?.minutes ?? ""}" placeholder="Estimate" /><span class="affix">min</span></span>
            </label>`)}
        </div>
      </div>
      ${!status.openai_key ? html`
        <div class="settings-row">
          <header><h2>Your OpenAI API key</h2><p>Used to test models on your cases. Saved on this computer only.</p></header>
          <div class="field"><input class="input mono" id="key" type="password" placeholder="sk-…" autocomplete="off" spellcheck="false" />
            <span class="hint">Create one at platform.openai.com → API keys.</span></div>
        </div>` : ""}
    </div>

    <div class="run-note">
      ${icon("Info")}
      <p>We'll test <strong>${modelNames || "two models"}</strong> on up to ${cfg.bench?.tasks_per_candidate ?? 50} past cases per step. A first run usually costs well under a dollar, and Evenpoint stops to ask before spending more than <strong>$${cfg.bench?.max_cost_usd ?? 5}</strong>.
      <a href="#" id="more">Change models and limits in Settings</a></p>
    </div>
    ${nav("Start analysis", "Play")}
    <p class="later"><a href="#" id="later">Save and finish later</a></p>`);

  const collect = () => {
    cfg.hourly_rate = Number($<HTMLInputElement>("#rate")!.value || 35);
    $$<HTMLInputElement>("[data-step]").forEach((i) => {
      const st = i.dataset.step!;
      const o = { ...(cfg.steps[st] || {}) };
      if (i.value === "") delete o.minutes;
      else o.minutes = Number(i.value);
      if (Object.keys(o).length) cfg.steps[st] = o;
      else delete cfg.steps[st];
    });
  };
  const save = async () => {
    collect();
    await api(`/projects/${encodeURIComponent(name)}/config`, { method: "PUT", body: cfg });
  };
  $("#later")!.addEventListener("click", async (e) => {
    e.preventDefault();
    await save();
    location.href = `/project/?p=${encodeURIComponent(name)}&tab=setup`;
  });
  $("#more")!.addEventListener("click", async (e) => {
    e.preventDefault();
    await save();
    location.href = `/project/?p=${encodeURIComponent(name)}&tab=setup`;
  });
  wireNav(undefined, async (btn) => {
    const key = $<HTMLInputElement>("#key");
    if (key && !key.value.trim()) {
      key.focus();
      return toast("Paste your OpenAI API key to run the analysis.", "error");
    }
    busy(btn, true, "Starting");
    try {
      if (key) await api("/settings/key", { method: "POST", body: { openai_api_key: key.value } });
      await save();
      await api<Job>(`/projects/${encodeURIComponent(name)}/run`, { method: "POST", body: {} });
      location.href = `/project/?p=${encodeURIComponent(name)}&tab=run`;
    } catch (err) {
      toast((err as Error).message, "error");
      busy(btn, false);
    }
  });
}

// ---------------------------------------------------------------- shared nav
function nav(label: string, ico = "ArrowRight"): Raw {
  return html`<div class="start-nav">
    <button class="btn ghost" type="button" id="back">${icon("ArrowLeft")}Back</button>
    <button class="btn primary lg" type="button" id="next">${ico === "Play" ? icon(ico) : ""}${label}${ico !== "Play" ? icon(ico) : ""}</button>
  </div>`;
}
function wireNav(validate?: () => string | void, onNext?: (btn: HTMLButtonElement) => void) {
  $("#back")!.addEventListener("click", () => go(step - 1));
  $<HTMLButtonElement>("#next")!.addEventListener("click", (e) => {
    const btn = e.currentTarget as HTMLButtonElement;
    if (onNext) return onNext(btn);
    const problem = validate?.();
    if (problem) return toast(problem, "error");
    go(step + 1);
  });
}

// ---------------------------------------------------------------- resume
async function init() {
  status = await api<Status>("/status");
  if (name && step > 1) {
    try {
      await loadConfig();
      const s = cfg.sources?.[0] as Source | undefined;
      const file = s?.path.split("/").pop();
      if (s && file) {
        info = await api<Inspect>(`/projects/${encodeURIComponent(name)}/inspect?file=${encodeURIComponent(file)}`);
        if ((s.adapter === "zendesk" || s.adapter === "jira") && info.adapter === s.adapter) s.mapping = { ...info.mapping, ...s.mapping };
      }
    } catch { step = 1; }
  }
  draw();
}

const css = raw(`
.start { max-width: 760px; margin: 0 auto; }
.steps { list-style: none; display: flex; gap: 8px; margin: 0 0 32px; padding: 0; flex-wrap: wrap; }
.steps li { display: inline-flex; align-items: center; gap: 8px; font-size: 13px; color: var(--text-3); font-weight: 500; }
.steps li + li::before { content: ""; width: 28px; height: 1px; background: var(--border-strong); margin-right: 0; }
.step-dot { width: 22px; height: 22px; border-radius: 50%; display: grid; place-items: center; font-size: 13px; border: 1px solid var(--border-strong); background: var(--surface); }
.steps li.current { color: var(--text); }
.steps li.current .step-dot { background: var(--accent); border-color: var(--accent); color: #fff; }
.steps li.done .step-dot { background: var(--good-soft); border-color: #bfe5d1; color: var(--good); }
.start-head { margin-bottom: 24px; }
.start-head h1 { letter-spacing: -0.02em; }
.start-head p { margin-top: 8px; color: var(--text-2); font-size: 15px; max-width: 64ch; line-height: 1.55; }
.drop { position: relative; display: grid; justify-items: center; gap: 8px; text-align: center; padding: 56px 24px; border: 1.5px dashed var(--border-strong); border-radius: 12px; background: var(--surface); cursor: pointer; transition: border-color 150ms, background 150ms, box-shadow 150ms; }
.drop:hover, .drop.over { border-color: var(--accent); background: var(--accent-soft); }
.drop.busy { pointer-events: none; }
.drop strong { font-size: 15px; font-weight: 600; }
.drop .link { color: var(--accent); text-decoration: underline; text-underline-offset: 3px; }
.drop-icon { width: 52px; height: 52px; border-radius: 12px; display: grid; place-items: center; background: var(--accent-soft); color: var(--accent); margin-bottom: 4px; }
.drop.over .drop-icon { background: var(--surface); }
.drop-progress { position: absolute; left: 0; right: 0; bottom: 0; height: 4px; overflow: hidden; border-radius: 0 0 12px 12px; background: var(--hover); }
.drop-progress span { display: block; height: 100%; background: var(--accent); transform: scaleX(0); transform-origin: left; transition: transform 160ms; }
.privacy { display: flex; gap: 8px; align-items: center; justify-content: center; margin-top: 12px; color: var(--text-3); font-size: 13px; }
.or { display: flex; align-items: center; gap: 12px; margin: 32px 0 14px; color: var(--text-3); font-size: 13px; }
.or::before, .or::after { content: ""; flex: 1; height: 1px; background: var(--border); }
.samples { display: grid; gap: 10px; }
.sample { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; gap: 14px; align-items: center; padding: 14px 16px; border: 1px solid var(--border); border-radius: var(--radius); background: var(--surface); font: inherit; color: var(--text-3); text-align: left; cursor: pointer; transition: border-color 120ms, background 120ms; }
.sample:hover { border-color: var(--accent); background: var(--accent-soft); }
.sample[aria-busy="true"] { opacity: 0.6; pointer-events: none; }
.sample > span:nth-child(2) { display: grid; gap: 2px; }
.sample strong { color: var(--text); font-weight: 550; }
.sample-icon { width: 38px; height: 38px; border-radius: 8px; display: grid; place-items: center; background: var(--accent-soft); color: var(--accent); }
.found + .found { margin-top: 16px; }
.flow { list-style: none; margin: 0; padding: 14px 18px; display: flex; flex-wrap: wrap; gap: 8px 6px; align-items: center; }
.flow li { display: flex; align-items: center; gap: 6px; }
.flow li + li::before { content: ""; width: 14px; height: 1px; background: var(--border-strong); }
.flow-step { padding: 9px 12px; border: 1px solid var(--accent); background: var(--accent-soft); border-radius: var(--radius); align-items: flex-start; }
.flow-step > span { display: grid; gap: 1px; }
.flow-step .muted { font-size: 13px; }
.flow-step.off { border-color: var(--border); background: var(--surface); }
.flow-step.off strong { color: var(--text-3); text-decoration: line-through; }
.flow-step input { margin-top: 2px; }
.chips { display: flex; flex-wrap: wrap; gap: 8px; padding: 16px 18px; }
.chip { display: inline-flex; align-items: center; gap: 6px; height: 32px; padding: 0 12px; border: 1px solid var(--border-strong); border-radius: 999px; background: var(--surface); color: var(--text-2); font-size: 13px; cursor: pointer; transition: border-color 120ms, background 120ms; }
.chip input { position: absolute; opacity: 0; width: 1px; height: 1px; }
.chip:has(input:focus-visible) { outline: 2px solid var(--accent); outline-offset: 2px; }
.chip.on { border-color: var(--accent); background: var(--accent-soft); color: var(--text); }
.chip.on .ico { color: var(--accent); }
.chip-kind { font-size: 13px; color: var(--text-3); padding-left: 6px; border-left: 1px solid var(--border-strong); }
.found-foot { justify-content: flex-start; align-items: center; gap: 10px; }
.found-foot .select { height: 30px; font-size: 13px; }
.minutes { display: grid; gap: 8px; }
.minute-row { display: grid; grid-template-columns: minmax(0, 1fr) 150px; align-items: center; gap: 12px; font-weight: 500; }
.run-note { display: flex; gap: 10px; margin-top: 18px; color: var(--text-2); font-size: 14px; }
.run-note .ico { margin-top: 2px; color: var(--text-3); }
.start-nav { display: flex; justify-content: space-between; align-items: center; margin-top: 28px; }
.later { text-align: right; margin-top: 10px; font-size: 13px; }
.later a { color: var(--text-3); }
@media (max-width: 600px) { .steps li:not(.current) > span:last-child { display: none; } .steps li + li::before { width: 16px; } .minute-row { grid-template-columns: 1fr; } .drop { padding: 40px 16px; } }
`);
if (!document.getElementById("start-css")) {
  const s = document.createElement("style");
  s.id = "start-css";
  s.textContent = css.value;
  document.head.append(s);
}

init().catch((err) => mount($("#step")!, html`<div class="callout error">${icon("TriangleAlert")}<span>${(err as Error).message}</span></div>`));
