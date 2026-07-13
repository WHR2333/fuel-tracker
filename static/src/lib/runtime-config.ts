// Runtime config fetched from the backend /api/v1/config endpoint.
// Vite bakes VITE_API_KEY at build time, but for Docker deployments the
// real key lives in the backend's environment. This module fetches it
// once on startup so the frontend uses the correct key regardless of
// what was in the build.
//
// If the fetch fails (e.g. CORS blocked during local dev), falls back
// to the Vite-injected value.

let cachedApiKey: string | null = null;
let inflight: Promise<string> | null = null;

const FALLBACK = import.meta.env.VITE_API_KEY ?? "";

export function getApiKey(): Promise<string> {
  if (cachedApiKey !== null) return Promise.resolve(cachedApiKey);
  if (inflight) return inflight;

  inflight = fetch("/api/v1/config")
    .then((res) => res.json())
    .then((data) => {
      cachedApiKey = (data.apiKey as string) ?? FALLBACK;
      return cachedApiKey;
    })
    .catch(() => {
      cachedApiKey = FALLBACK;
      return cachedApiKey;
    })
    .finally(() => {
      inflight = null;
    }) as Promise<string>;

  return inflight;
}