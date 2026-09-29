import type { Run, RunRequest, Stats } from "./types";

const BASE = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000").replace(/\/$/, "");

export class ApiError extends Error {}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      ...init,
      headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
    });
  } catch {
    throw new ApiError("Cannot reach the API. If it is on Render's free tier it may be waking up; retry in a minute.");
  }
  if (!res.ok) {
    let detail = `Request failed (HTTP ${res.status})`;
    try {
      const body = await res.json();
      if (typeof body.detail === "string") detail = body.detail;
      else if (Array.isArray(body.detail)) detail = body.detail.map((d: { msg: string }) => d.msg).join("; ");
    } catch { /* keep default message */ }
    throw new ApiError(detail);
  }
  return res.json() as Promise<T>;
}

export const api = {
  listRuns: () => request<Run[]>("/runs"),
  createRun: (body: RunRequest) => request<Run>("/runs", { method: "POST", body: JSON.stringify(body) }),
  stats: () => request<Stats>("/stats"),
};
