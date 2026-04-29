const base = () => (import.meta.env.VITE_API_BASE ?? "").replace(/\/$/, "");

export async function apiGet<T>(path: string): Promise<T> {
  const url = `${base()}${path.startsWith("/") ? path : `/${path}`}`;
  const r = await fetch(url, { credentials: "include" });
  if (!r.ok) throw new Error(await r.text());
  return r.json() as Promise<T>;
}

export async function apiPatch(path: string, body: unknown): Promise<void> {
  const url = `${base()}${path.startsWith("/") ? path : `/${path}`}`;
  const r = await fetch(url, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(await r.text());
}

export async function apiDelete(path: string): Promise<void> {
  const url = `${base()}${path.startsWith("/") ? path : `/${path}`}`;
  const r = await fetch(url, { method: "DELETE", credentials: "include" });
  if (!r.ok) throw new Error(await r.text());
}
