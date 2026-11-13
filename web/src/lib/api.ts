// Typed client for the local Evenpoint API (evenpoint/server.py).

export type Job = {
  project: string; kind: "run" | "rerun" | "review"; state: "running" | "confirm" | "done" | "error" | "cancelled";
  stage: string | null; log: string[]; progress: { done: number; total: number } | null;
  estimate: number | null; limit: number | null; error: string | null; started: number; finished: number | null;
};
export type ModelInfo = { id: string; about: string; input_cost_per_token?: number; output_cost_per_token?: number };
export type Status = {
  version: string; workspace: string; openai_key: boolean; job: Job | null; stages: string[]; dev: boolean;
  examples: { id: string; title: string; about: string }[];
  models: ModelInfo[];
};
export type ProjectSummary = {
  name: string; sources: string[]; models: string[]; updated: string;
  run: null | { run_id: string; started_at: string; worth_automating: number; hours: number; value: number; value_low: number; cases: number };
};
export type Config = Record<string, any>;
export type Project = ProjectSummary & { config: Config; files: string[] };
export type Inspect = {
  file: string; adapter: "csv" | "zendesk" | "jira" | "mbox"; headers: string[]; rows: Record<string, string>[];
  row_count: number | null; timestamp_columns?: string[]; text_columns?: string[]; label_columns?: string[];
  timestamp_counts?: Record<string, number>; first_date?: string | null; last_date?: string | null;
  mapping: Record<string, any>;
};

export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export async function api<T = any>(path: string, opts: { method?: string; body?: unknown } = {}): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method: opts.method || "GET",
    headers: { "X-Evenpoint": "1", ...(opts.body !== undefined ? { "Content-Type": "application/json" } : {}) },
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  let data: any = null;
  try { data = await res.json(); } catch { /* empty or non-JSON body */ }
  if (!res.ok) throw new ApiError(res.status, data?.error || `Request failed (${res.status}).`);
  return data as T;
}

/** Upload a file as the raw request body, reporting progress (0..1). */
export function upload(project: string, file: File, onProgress: (p: number) => void): Promise<Inspect> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `/api/projects/${encodeURIComponent(project)}/upload`);
    xhr.setRequestHeader("X-Evenpoint", "1");
    xhr.setRequestHeader("X-Filename", encodeURIComponent(file.name));
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total);
    xhr.onload = () => {
      let data: any = null;
      try { data = JSON.parse(xhr.responseText); } catch { /* ignore */ }
      xhr.status < 300 ? resolve(data) : reject(new ApiError(xhr.status, data?.error || "Upload failed."));
    };
    xhr.onerror = () => reject(new ApiError(0, "Couldn't reach Evenpoint. Is `evenpoint ui` still running?"));
    xhr.send(file);
  });
}
