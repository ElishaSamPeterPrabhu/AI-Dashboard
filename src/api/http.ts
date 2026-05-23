import { getStoredToken } from "@/auth/tid";

/** Set from ?apiBase= when embedded inside Assist MCP App (Amplify may lack VITE_API_BASE). */
let runtimeApiBase = "";

export function setRuntimeApiBase(base: string): void {
  runtimeApiBase = base.replace(/\/$/, "");
}

export const apiBase = (): string => {
  if (runtimeApiBase) return runtimeApiBase;
  return (import.meta.env.VITE_API_BASE ?? "").replace(/\/$/, "");
};

const url = (path: string) =>
  `${apiBase()}${path.startsWith("/") ? path : `/${path}`}`;

function authHeaders(extra?: Record<string, string>): Record<string, string> {
  const headers: Record<string, string> = { ...extra };
  const token = getStoredToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

export async function apiGet<T>(path: string): Promise<T> {
  const r = await fetch(url(path), {
    credentials: "include",
    headers: authHeaders(),
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json() as Promise<T>;
}

export async function apiPost<T>(path: string, body: unknown): Promise<T> {
  const r = await fetch(url(path), {
    method: "POST",
    headers: authHeaders({ "Content-Type": "application/json" }),
    credentials: "include",
    body: JSON.stringify(body),
  });
  const text = await r.text();
  let json: unknown;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    throw new Error(`Non-JSON response from ${path}: ${text.slice(0, 200)}`);
  }
  if (!r.ok) {
    const msg =
      (json as { error?: string; message?: string } | null)?.error ??
      (json as { error?: string; message?: string } | null)?.message ??
      text;
    throw new Error(msg || `${r.status}`);
  }
  return json as T;
}

export async function apiPatch(path: string, body: unknown): Promise<void> {
  const r = await fetch(url(path), {
    method: "PATCH",
    headers: authHeaders({ "Content-Type": "application/json" }),
    credentials: "include",
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(await r.text());
}

export async function apiDelete(path: string): Promise<void> {
  const r = await fetch(url(path), { method: "DELETE", credentials: "include" });
  if (!r.ok) throw new Error(await r.text());
}
