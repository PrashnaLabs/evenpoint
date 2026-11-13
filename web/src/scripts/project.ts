// Project page: title, one primary action, three tabs. A running analysis shows its progress
// in place of the results, so there is no separate Run tab to find.
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
type Tab = "results" | "review" | "setup";

const TABS: { id: Tab; label: string }[] = [
  { id: "results", label: "Results" },
  { id: "review", label: "Check AI answers" },
  { id: "setup", label: "Settings" },
];

const params = new URLSearchParams(location.search);
const name = params.get("p") || "";
const asked = params.get("tab");
let current: Tab = asked === "setup" || asked === "review" ? asked : "results";
let pollTimer: number | undefined;

const ctx = { name, job: null } as unknown as Ctx;
const running = () => !!ctx.job && ["running", "confirm"].includes(ctx.job.state);

ctx.go = (tab: Tab | "run") => {
  const next: Tab = tab === "run" ? "results" : tab;
  if (document.querySelector("[data-dirty='true']") && !confirm("Leave without saving your changes?")) return;
  current = next;
  const url = new URL(location.href);
  url.searchParams.set("tab", next);
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
    drawHeader();
    ctx.go("results");
    poll();
  } catch (err) {
    toast((err as Error).message, "error");
  }
};

function drawHeader() {
  const p = ctx.project;
  document.title = `${p.name} · Evenpoint`;
  mount($("#title")!, html`${p.name}`);
  mount($("#subtitle")!, html`
    <span class="pill">${icon("FileSpreadsheet", "sm")}${p.sources[0] || "No data yet"}</span>
    <span class="pill">${running() ? html`${icon("LoaderCircle", "sm spin")}Running now` : p.run ? `Updated ${ago(p.run.started_at)}` : "Not run yet"}</span>`);
  mount($("#actions")!, html`
    ${p.run ? html`<a class="btn ghost" href="/api/projects/${encodeURIComponent(p.name)}/report?download=1" title="Download a shareable HTML report">${icon("Download")}Report</a>` : ""}
    <button class="btn primary" id="run-btn" type="button" ${running() || !p.sources.length ? "disabled" : ""}>
      ${icon("Play")}${p.run ? "Run again" : "Run analysis"}
    </button>`);
  $("#run-btn")?.addEventListener("click", (e) => {
    busy(e.currentTarget as HTMLButtonElement, true, "Starting");
    ctx.startRun();
  });
}

function drawTabs() {
  mount($("#tabs")!, html`${TABS.map((t) => html`
    <button role="tab" type="button" data-tab="${t.id}" aria-selected="${t.id === current}">${t.label}</button>`)}`);
  document.querySelectorAll<HTMLButtonElement>("#tabs button").forEach((b) =>
    b.addEventListener("click", () => ctx.go(b.dataset.tab as Tab)));
}

function drawTab() {
  const el = $("#tab")!;
  $("#setup-banner")?.remove();
  if (!ctx.project.sources.length) {
    el.insertAdjacentHTML("beforebegin", html`<div class="callout info fade-in" id="setup-banner" style="margin-bottom:24px">${icon("Sparkles")}
      <div class="callout-body"><strong>Finish setting up this project</strong><span>Add your export and two numbers. About two minutes.</span>
      <div><a class="btn primary sm" href="/start/?p=${encodeURIComponent(ctx.name)}&step=1">Continue ${icon("ArrowRight", "sm")}</a></div></div></div>`.value);
  }
  el.innerHTML = "";
  el.oninput = el.onchange = null;
  delete el.dataset.dirty;
  el.classList.remove("fade-in");
  void el.offsetWidth;
  el.classList.add("fade-in");
  const render = current === "results" && ctx.job && ctx.job.state !== "done" ? renderRun
    : current === "results" ? renderResults : current === "review" ? renderReview : renderSetup;
  Promise.resolve(render(el, ctx)).catch((err) =>
    mount(el, html`<div class="callout error">${icon("TriangleAlert")}<span>${(err as Error).message}</span></div>`));
}

/** Poll the job while it runs; the run view listens for the `job` event. */
function poll() {
  clearTimeout(pollTimer);
  const tick = async () => {
    try {
      const job = await api<Job | null>("/job");
      ctx.job = job && job.project === name ? job : null;
      document.dispatchEvent(new CustomEvent("job", { detail: ctx.job }));
      if (running()) {
        pollTimer = window.setTimeout(tick, 700);
        return;
      }
      await ctx.reload();
      if (ctx.job?.state === "done") {
        toast(ctx.job.kind === "review" ? "Results updated with your grades." : "Analysis finished.");
        ctx.go("results");
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
  if (!asked) current = ctx.project.run || running() ? "results" : "setup";
  if (ctx.job?.state === "done") ctx.job = null;  // a finished job from earlier: just show results
  drawTabs();
  drawTab();
  if (running()) poll();
}

window.addEventListener("beforeunload", (e) => {
  if (document.querySelector("[data-dirty='true']")) e.preventDefault();
});
init();
