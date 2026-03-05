const CACHE_NAME = "kiosk-v1";

self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(clients.claim());
});

self.addEventListener("fetch", (event) => {
  // Network-first strategy — kiosk is always online
  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request))
  );
});
