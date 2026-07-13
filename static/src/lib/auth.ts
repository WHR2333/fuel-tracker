// Client-side auth helpers.
// Token is stored in localStorage and attached as a Bearer header by api.ts.
// The server verifies the signature; we only decode the payload here to
// check expiry so we can redirect to /login without a round-trip.

const TOKEN_KEY = "fuel.auth.token";

// ---- storage ----

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

// ---- predicates ----

/** Decode JWT payload without verifying (server verifies). */
function decodePayload(): Record<string, unknown> | null {
  const token = getToken();
  if (!token) return null;
  try {
    return JSON.parse(atob(token.split(".")[1]));
  } catch {
    return null;
  }
}

/** True when a non-expired token exists in storage. */
export function isAuthenticated(): boolean {
  const p = decodePayload();
  if (!p) return false;
  if (typeof p.exp !== "number" || p.exp * 1000 <= Date.now()) {
    clearToken();
    return false;
  }
  return true;
}

/** Return current username from JWT, or null. */
export function getUsername(): string | null {
  return (decodePayload()?.sub as string) ?? null;
}

/** Return whether the current user is an admin. */
export function isAdmin(): boolean {
  return decodePayload()?.admin === true;
}

// ---- actions ----

export class LoginError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

const BASE = import.meta.env.VITE_API_BASE ?? "/api/v1";

/**
 * POST credentials to the server and store the returned JWT.
 * Throws LoginError on failure (wrong creds, account locked, network).
 */
export async function login(username: string, password: string): Promise<void> {
  const res = await fetch(`${BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });

  if (!res.ok) {
    let detail = res.statusText;
    try {
      const j = await res.json();
      if (j?.detail) detail = String(j.detail);
    } catch {
      /* ignore */
    }
    throw new LoginError(res.status, detail);
  }

  const data = await res.json();
  setToken(data.access_token);
}

import { invalidateAll } from "./api-cache";

export function logout(): void {
  clearToken();
  invalidateAll();
}
