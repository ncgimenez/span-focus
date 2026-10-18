// Span Focus Service Worker - Offline PWA Support
const CACHE_NAME = 'span-focus-v3.41';

const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './style.css?v=3.41',
  './manifest.json',
  './favicon.ico',
  './span-logo.svg',
  './span-logo.png',
  './apple-touch-icon.png',
  './js/audio.js?v=3.41',
  './js/timer.js?v=3.41',
  './js/timer-worker.js?v=3.41',
  './js/tasks.js?v=3.41',
  './js/track.js?v=3.41',
  './js/sync.js?v=3.41',
  './js/app.js?v=3.41'
];

// Install: pre-cache all core assets
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    }).then(() => self.skipWaiting())
  );
});

// Activate: clean up older caches
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch: Stale-While-Revalidate caching strategy
self.addEventListener('fetch', (e) => {
  // Pass Supabase Cloud sync requests directly to the network
  if (e.request.url.includes('supabase.co')) {
    return;
  }

  e.respondWith(
    caches.match(e.request).then((cachedResponse) => {
      if (cachedResponse) {
        // Update cache in the background
        fetch(e.request).then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200 && e.request.method === 'GET') {
            caches.open(CACHE_NAME).then((cache) => cache.put(e.request, networkResponse));
          }
        }).catch(() => {});
        return cachedResponse;
      }

      return fetch(e.request).then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200 && e.request.method === 'GET') {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(e.request, responseToCache));
        }
        return networkResponse;
      });
    })
  );
});
