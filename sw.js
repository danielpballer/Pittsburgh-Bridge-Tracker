/* ═══════════════════════════════════════════════════════════════
   PITTSBURGH BRIDGE TRACKER — sw.js
   Service Worker · Cache-first app shell · Skip OSM tiles
═══════════════════════════════════════════════════════════════ */

'use strict';

const CACHE_NAME = 'pgh-bridge-tracker-v11';

const APP_SHELL = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './bridges.json',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

/* ─── INSTALL: pre-cache app shell ──────────────────────────── */
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
      .catch(err => console.warn('[SW] Install cache failed:', err))
  );
});

/* ─── ACTIVATE: delete old caches ───────────────────────────── */
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys
          .filter(key => key !== CACHE_NAME)
          .map(key => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

/* ─── FETCH: cache-first for app shell, skip map tiles ──────── */
self.addEventListener('fetch', event => {
  const url = event.request.url;

  // Let OSM tile requests go straight to network (they won't be cached)
  if (url.includes('tile.openstreetmap.org') ||
      url.includes('unpkg.com')) {
    return; // browser handles it normally
  }

  // For everything else: cache-first, fall back to network
  event.respondWith(
    caches.match(event.request)
      .then(cached => {
        if (cached) return cached;

        return fetch(event.request)
          .then(response => {
            // Only cache successful same-origin responses
            if (
              response.ok &&
              event.request.method === 'GET' &&
              new URL(event.request.url).origin === self.location.origin
            ) {
              const clone = response.clone();
              caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
            }
            return response;
          })
          .catch(() => {
            // Offline fallback for navigation requests
            if (event.request.mode === 'navigate') {
              return caches.match('./index.html');
            }
            return new Response('Offline', { status: 503, statusText: 'Service Unavailable' });
          });
      })
  );
});

/* ─── MESSAGE: force update from client ─────────────────────── */
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
