// Small DOM helpers shared by every screen: escaping, formatting, icons, toasts.
import {
  ArrowLeft, ArrowRight, Ban, Check, ChevronDown, ChevronRight, Circle, CircleCheck, CircleX, ClipboardCheck,
  Download, FileSpreadsheet, FlaskConical, FolderOpen, Gauge, Info, KeyRound, ListChecks, LoaderCircle, Mail,
  Play, Plus, RotateCcw, Settings, SkipForward, Sparkles, Square, TriangleAlert, Upload, Workflow, X,
} from "lucide-static";

const ICONS: Record<string, string> = {
  ArrowLeft, ArrowRight, Ban, Check, ChevronDown, ChevronRight, Circle, CircleCheck, CircleX, ClipboardCheck,
  Download, FileSpreadsheet, FlaskConical, FolderOpen, Gauge, Info, KeyRound, ListChecks, LoaderCircle, Mail,
  Play, Plus, RotateCcw, Settings, SkipForward, Sparkles, Square, TriangleAlert, Upload, Workflow, X,
};

export class Raw {
  constructor(public value: string) {}
  toString() { return this.value; }
}
export const raw = (s: string) => new Raw(s);

export function esc(v: unknown): string {
  return String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

/** Tagged template: interpolations are escaped unless wrapped in raw(); arrays are joined. */
export function html(strings: TemplateStringsArray, ...vals: unknown[]): Raw {
  let out = strings[0];
  vals.forEach((v, i) => {
    const part = (x: unknown): string =>
      x instanceof Raw ? x.value : Array.isArray(x) ? x.map(part).join("") : x === false || x == null ? "" : esc(x);
    out += part(v) + strings[i + 1];
  });
  return raw(out);
}

export function icon(name: string, cls = ""): Raw {
  const svg = (ICONS[name] || "").replace(/\s(width|height)="24"/g, "");
  return raw(`<span class="ico ${cls}" aria-hidden="true">${svg}</span>`);
}

export function mount(el: Element, content: Raw | string) {
  el.innerHTML = content instanceof Raw ? content.value : content;
}

export const $ = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document) =>
  root.querySelector(sel) as T | null;
export const $$ = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document) =>
  Array.from(root.querySelectorAll(sel)) as T[];

// ---------- formatting
const nf = (d: number) => new Intl.NumberFormat("en-US", { maximumFractionDigits: d, minimumFractionDigits: d });
export const num = (v: number | null | undefined, d = 0) => (v == null || Number.isNaN(v) ? "–" : nf(d).format(v));
export const usd = (v: number | null | undefined, d = 0) => {
  if (v == null || Number.isNaN(v)) return "–";
  const s = nf(d).format(Math.abs(v));
  return `${v < 0 ? "−" : ""}$${s}`;
};
export const signedUsd = (v: number | null | undefined, d = 0) =>
  v == null ? "–" : `${v > 0 ? "+" : ""}${usd(v, d)}`;
export const pct = (v: number | null | undefined) => (v == null ? "–" : `${Math.round(v * 100)}%`);
export const hrs = (v: number | null | undefined, d = 0) =>
  v == null ? "–" : `${v < 0 ? "−" : ""}${nf(d).format(Math.abs(v))} h`;
export function smallUsd(v: number | null | undefined) {
  if (v == null) return "–";
  if (v === 0) return "$0";
  return v < 0.01 ? `$${v.toFixed(4)}` : v < 1 ? `$${v.toFixed(3)}` : usd(v, 2);
}
export function ago(iso?: string | null) {
  if (!iso) return "never";
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return "just now";
  const units: [number, string][] = [[60, "minute"], [3600, "hour"], [86400, "day"], [604800, "week"], [2629800, "month"]];
  let label = "";
  for (const [secs, name] of units) if (s >= secs) label = `${Math.floor(s / secs)} ${name}${Math.floor(s / secs) > 1 ? "s" : ""} ago`;
  return label;
}
export const dateShort = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "–";
export const modelName = (m: string) => m.replace(/^openai\//, "");
export const stepName = (s: string) => {
  const t = s.replace(/[_:]+/g, " ").trim();
  return t.charAt(0).toUpperCase() + t.slice(1);
};

export const VERDICT: Record<string, { label: string; icon: string }> = {
  automate: { label: "Automate", icon: "CircleCheck" },
  review: { label: "Automate with review", icon: "ClipboardCheck" },
  dont_automate: { label: "Don't automate", icon: "Ban" },
};
export const verdictBadge = (v: string) => html`<span class="badge ${v}">${icon(VERDICT[v]?.icon || "Circle")}${VERDICT[v]?.label || v}</span>`;
export const MODE: Record<string, string> = { auto: "Fully automatic", draft_review: "AI drafts, person approves" };
export const TASK: Record<string, string> = { classify: "Pick a label", extract: "Copy a value", draft: "Write a reply" };

// ---------- toasts
export function toast(message: string, kind: "info" | "error" = "info") {
  let host = $(".toasts");
  if (!host) {
    host = document.createElement("div");
    host.className = "toasts";
    host.setAttribute("role", "status");
    host.setAttribute("aria-live", "polite");
    document.body.append(host);
  }
  const t = document.createElement("div");
  t.className = `toast ${kind}`;
  t.innerHTML = html`${icon(kind === "error" ? "TriangleAlert" : "Check")}<span>${message}</span>`.value;
  host.append(t);
  setTimeout(() => t.remove(), kind === "error" ? 7000 : 3500);
}

export function busy(btn: HTMLButtonElement | null, on: boolean, label?: string) {
  if (!btn) return;
  if (on) {
    btn.dataset.label = btn.innerHTML;
    btn.setAttribute("aria-busy", "true");
    btn.innerHTML = html`${icon("LoaderCircle", "spin")}${label || "Working"}`.value;
  } else {
    btn.removeAttribute("aria-busy");
    if (btn.dataset.label) btn.innerHTML = btn.dataset.label;
  }
}
