/**
 * Spritemotion service worker.
 *
 * Lives in `public/` so it is emitted to the site root verbatim: a hashed copy under
 * /assets/ would never be registrable, and a missing file makes registration fail.
 *
 * Strategy per request kind:
 *  - navigation  → network first, cached shell as the offline fallback (never serve a
 *                  stale app shell that points at deleted asset hashes).
 *  - /assets/*   → cache first; those URLs carry a content hash, so they never change.
 *  - fonts       → stale while revalidate, so an installed app keeps its typography offline.
 *  - everything else → cache first with a background refresh.
 */
const VERSION = 'v2';
const SHELL_CACHE = `spritemotion-shell-${VERSION}`;
const ASSET_CACHE = `spritemotion-assets-${VERSION}`;
const FONT_CACHE = `spritemotion-fonts-${VERSION}`;
const CURRENT_CACHES = [SHELL_CACHE, ASSET_CACHE, FONT_CACHE];

const SHELL_URLS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icon-192.svg',
  './icon-512.svg',
  './favicon.ico',
  './examples/sample_walk.json',
];

const FONT_ORIGINS = ['https://fonts.googleapis.com', 'https://fonts.gstatic.com'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) => cache.addAll(SHELL_URLS)).catch(() => undefined)
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => !CURRENT_CACHES.includes(key)).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

const putInCache = async (cacheName, request, response) => {
  if (!response || response.status !== 200) return;
  const cache = await caches.open(cacheName);
  await cache.put(request, response.clone());
};

const cacheFirst = async (cacheName, request) => {
  const cached = await caches.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  await putInCache(cacheName, request, response);
  return response;
};

const staleWhileRevalidate = async (cacheName, request) => {
  const cached = await caches.match(request);
  const network = fetch(request)
    .then((response) => {
      putInCache(cacheName, request, response);
      return response;
    })
    .catch(() => cached);
  return cached || network;
};

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          putInCache(SHELL_CACHE, request, response);
          return response;
        })
        .catch(async () => (await caches.match(request)) || (await caches.match('./index.html')))
    );
    return;
  }

  if (FONT_ORIGINS.includes(url.origin)) {
    event.respondWith(staleWhileRevalidate(FONT_CACHE, request));
    return;
  }

  if (url.origin === self.location.origin && url.pathname.includes('/assets/')) {
    event.respondWith(cacheFirst(ASSET_CACHE, request));
    return;
  }

  if (url.origin === self.location.origin) {
    event.respondWith(staleWhileRevalidate(SHELL_CACHE, request));
  }
});
