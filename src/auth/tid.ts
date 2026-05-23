// TID auth disabled — stub only. Replace with full PKCE implementation when needed.
export function getStoredToken(): string | null {
  return null;
}

export async function ensureToken(): Promise<void> {
  // no-op
}

export async function openTidLogin(): Promise<string | null> {
  return null;
}

export function clearToken(): void {
  // no-op
}

export function clearStoredToken(): void {
  // no-op
}
