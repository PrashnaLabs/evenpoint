// Project page controller: header, tabs, job polling. Each tab renders itself into #tab.
import { api, type Job, type Project, type Status } from "../lib/api";
import { $, ago, busy, html, icon, mount, toast } from "../lib/ui";
import { renderResults } from "./results";
import { renderSetup } from "./setup";
import { renderRun } from "./run";
import { renderReview } from "./review";

export type Ctx = {
  name: string;
  status: Status;
  project: Project;
  job: Job | null;
  go: (tab: Tab) => void;
  reload: () => Promise<void>;
  startRun: (body?: Record<string, unknown>, path?: string) => Promise<void>;
};
type Tab = "results" | "setup" | "run" | "review";

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: "results", label: "Results", icon: "Gauge" },
  { id: "setup", label: "Settings", icon: "Settings" },
  { id: "run", label: "Run", icon: "Play" },
  { id: "review", label: "Review AI work", icon: "ListChecks" },
];
const RENDER: Record<Tab, (el: HTMLElement, ctx: Ctx) => void | Promise<void>> = {
  results: renderResults, setup: renderSetup, run: renderRun, review: renderReview,
};

const params = new URLSearchParams(location.search);
const name = params.get("p") || "";
let current: Tab = (params.get("tab") as Tab) || "results";
let pollTimer: number | undefined;

const ctx = { name, job: null } as unknown as Ctx;

ctx.go = (tab: Tab) => {
  if (document.querySelector("[data-dirty='true']") && !confirm("Leave without saving your changes?")) return;
  current = tab;
  const url = new URL(location.href);
  url.searchParams.set("tab", tab);
  history.replaceState(null, "", url);
  drawTabs();
  drawTab();
};

ctx.reload = async () => {
  const [status, project] = await Promise.all([
    api<Status>("/status"),
    api<Project>(`/projects/${encodeURIComponent(name)}`),
  ]);
  ctx.status = status;
  ctx.project = project;
  ctx.job = status.job && status.job.project === name ? status.job : null;
  drawHeader();
};

ctx.startRun = async (body = {}, path = "run") => {
  try {
    ctx.job = await api<Job>(`/projects/${encodeURIComponent(name)}/${path}`, { method: "POST", body });
    ctx.go("run");
    poll();
  } catch (err) {
    toast((err as Error).message, "error");
  }
};

function drawHeader() {
  const p = ctx.project;
  document.title = `${p.name} · Evenpoint`;
  mount($("#title")!, html`${p.name}`);
  const running = ctx.job && ["running", "confirm"].includes(ctx.job.state);
  mount($("#subtitle")!, html`
    <span class="pill">${icon("FileSpreadsheet", "sm")}${p.sources[0] || "No data yet"}</span>
    <span class="pill">${icon("RotateCcw", "sm")}${p.run ? `Last run ${ago(p.run.started_at)}` : "Not run yet"}</span>
    ${running ? html`<span class="badge review">${icon("LoaderCircle", "spin")}Running</span>` : ""}`);
  mount($("#actions")!, html`
    ${p.run ? html`<a class="btn" href="/api/projects/${encodeURIComponent(p.name)}/report?download=1">${icon("Download")}Download report</a>` : ""}
    <button class="btn primary" id="run-btn" type="button" ${running || !p.sources.length ? "disabled" : ""}>
      ${icon("Play")}${p.run ? "Run again" : "Run analysis"}
    </button>`);
  $("#run-btn")?.addEventListener("click", (e) => {
    busy(e.currentTarget as HTMLButtonElement, true, "Starting");
    ctx.startRun();
  });

  mount($("#project-nav")!, html`
    <div class="nav-label project-name" title="${p.name}">${p.name}</div>
    ${TABS.map((t) => html`<a href="?p=${encodeURIComponent(p.name)}&tab=${t.id}" data-tab="${t.id}"
        aria-current="${t.id === current ? "page" : "false"}">${icon(t.icon)}${t.label}</a>`)}`);
  document.querySelectorAll<HTMLAnchorElement>("#project-nav a[data-tab]").forEach((a) =>
    a.addEventListener("click", (e) => {
      e.preventDefault();
      $("#app")?.classList.remove("nav-open");
      ctx.go(a.dataset.tab as Tab);
    }));
}

function drawTabs() {
  mount($("#tabs")!, html`${TABS.map((t) => html`
    <button role="tab" type="button" data-tab="${t.id}" aria-selected="${t.id === current}">${icon(t.icon)}${t.label}</button>`)}`);
  document.querySelectorAll<HTMLButtonElement>("#tabs button").forEach((b) =>
    b.addEventListener("click", () => ctx.go(b.dataset.tab as Tab)));
  document.querySelectorAll<HTMLAnchorElement>("#project-nav a[data-tab]").forEach((a) =>
    a.setAttribute("aria-current", a.dataset.tab === current ? "page" : "false"));
}

function drawTab() {
  const el = $("#tab")!;
  const banner = $("#setup-banner");
  if (banner) banner.remove();
  if (!ctx.project.sources.length) {
    el.insertAdjacentHTML("beforebegin", html`<div class="callout info" id="setup-banner" style="margin-bottom:20px">${icon("Sparkles")}
      <div class="callout-body"><strong>Finish setting up this project</strong><span>Add your export and confirm two numbers. It takes about two minutes.</span>
      <div><a class="btn primary sm" href="/start/?p=${encodeURIComponent(ctx.name)}&step=1">Continue setup ${icon("ArrowRight", "sm")}</a></div></div></div>`.value);
  }
  el.innerHTML = "";
  el.oninput = el.onchange = null;
  delete el.dataset.dirty;
  Promise.resolve(RENDER[current](el, ctx)).catch((err) =>
    mount(el, html`<div class="callout error">${icon("TriangleAlert")}<span>${(err as Error).message}</span></div>`));
}

/** Poll the job while it runs; tabs listen for the `job` event. */
function poll() {
  clearTimeout(pollTimer);
  const tick = async () => {
    try {
      const job = await api<Job | null>("/job");
      ctx.job = job && job.project === name ? job : null;
      document.dispatchEvent(new CustomEvent("job", { detail: ctx.job }));
      if (ctx.job && ["running", "confirm"].includes(ctx.job.state)) {
        pollTimer = window.setTimeout(tick, 700);
      } else {
        await ctx.reload();
        if (ctx.job?.state === "done") {
          toast(ctx.job.kind === "review" ? "Results updated with your grades." : "Analysis finished.");
          if (current === "run" || current === "review") ctx.go("results");
        }
        if (ctx.job?.state === "error") toast("The run stopped with an error. See the Run tab.", "error");
      }
    } catch {
      pollTimer = window.setTimeout(tick, 2000);
    }
  };
  tick();
}

async function init() {
  if (!name) {
    location.href = "/";
    return;
  }
  try {
    await ctx.reload();
  } catch (err) {
    mount($("#title")!, html`Project not found`);
    mount($("#tab")!, html`<div class="callout error">${icon("TriangleAlert")}<span>${(err as Error).message} <a href="/">Back to projects</a></span></div>`);
    return;
  }
  if (!params.get("tab")) current = ctx.project.run ? "results" : "setup";
  if (ctx.job && ["running", "confirm"].includes(ctx.job.state) && !params.get("tab")) current = "run";
  drawHeader();
  drawTabs();
  drawTab();
  if (ctx.job && ["running", "confirm"].includes(ctx.job.state)) poll();
}

window.addEventListener("beforeunload", (e) => {
  if (document.querySelector("[data-dirty='true']")) e.preventDefault();
});
init();
