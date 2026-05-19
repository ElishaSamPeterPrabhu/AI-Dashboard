export const apiBase = (): string =>
  (import.meta.env.VITE_API_BASE ?? "").replace(/\/$/, "");

const url = (path: string) =>
  `${apiBase()}${path.startsWith("/") ? path : `/${path}`}`;

export async function apiGet<T>(path: string): Promise<T> {
  const r = await fetch(url(path), { credentials: "include" });
  if (!r.ok) throw new Error(await r.text());
  return r.json() as Promise<T>;
}

export async function apiPost<T>(path: string, body: unknown): Promise<T> {
  const r = await fetch(url(path), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
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
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(await r.text());
}

export async function apiDelete(path: string): Promise<void> {
  const r = await fetch(url(path), { method: "DELETE", credentials: "include" });
  if (!r.ok) throw new Error(await r.text());
}
