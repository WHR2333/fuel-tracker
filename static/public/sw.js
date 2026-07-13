// Minimal service worker — just enough to make the PWA installable.
// No offline caching; the app requires a network connection.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));
