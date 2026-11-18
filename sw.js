'use strict';
/* Service Worker: Netzwerk zuerst (Updates kommen sofort an), Cache als Rückfall für Offline.
   Supabase- und andere fremde Anfragen laufen nie über den Cache. */
const CACHE = 'finanz-shell-v1';
const SHELL = ['./', 'index.html', 'style.css', 'core.js', 'app.js', 'views.js', 'neu.js', 'forms.js', 'boot.js', 'vendor/supabase.js', 'manifest.webmanifest', 'icon.svg'];
self.addEventListener('install', (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).catch(() => {}).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', (e) => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin) return;
  e.respondWith(fetch(req, { cache: 'no-cache' }).then((res) => {
    if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
    return res;
  }).catch(() => caches.match(req, { ignoreSearch: false }).then((r) => r || caches.match(req, { ignoreSearch: true }) || caches.match('./'))));
});
