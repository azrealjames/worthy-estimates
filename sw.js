/* Worthy Estimates service worker — cache-first app shell, runtime cache for fonts */
const CACHE = "worthy-estimates-v8";
const SHELL = [
  "./",
  "./index.html",
  "./styles.css",
  "./app.js",
  "./jspdf.umd.min.js",
  "./manifest.webmanifest",
  "./icons/icon-192.png",
  "./icons/icon-512.png"
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;

  // Only the app shell and its fonts go through the cache. Analytics and any
  // other third party goes straight to the network, untouched — a stale cached
  // analytics script would be worse than none, and beacons must not be served
  // from cache.
  const reqUrl = new URL(req.url);
  const ours =
    reqUrl.origin === location.origin ||
    reqUrl.hostname === "fonts.googleapis.com" ||
    reqUrl.hostname === "fonts.gstatic.com";
  if (!ours) return;

  e.respondWith(
    caches.match(req, { ignoreSearch: req.mode === "navigate" }).then((hit) => {
      if (hit) return hit;
      return fetch(req).then((res) => {
        // Runtime-cache successful same-origin responses and Google Fonts
        const url = new URL(req.url);
        const cacheable =
          res &&
          (res.ok || res.type === "opaque") &&
          (url.origin === location.origin ||
           url.hostname === "fonts.googleapis.com" ||
           url.hostname === "fonts.gstatic.com");
        if (cacheable) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      }).catch(() => {
        if (req.mode === "navigate") return caches.match("./index.html");
      });
    })
  );
});
