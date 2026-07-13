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

/** True when a non-expired token exists in storage. */
export function isAuthenticated(): boolean {
  const token = getToken();
  if (!token) return false;
  try {
    const payload = JSON.parse(atob(token.split(".")[1]));
    // exp is in seconds
    return typeof payload.exp === "number" && payload.exp * 1000 > Date.now();
  } catch {
    // malformed token — treat as unauthenticated
    clearToken();
    return false;
  }
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

export function logout(): void {
  clearToken();
}
