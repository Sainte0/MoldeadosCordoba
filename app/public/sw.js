// Service worker: que la app abra y funcione sin señal en la planta y el playón.
// - Páginas: primero la red (para tener siempre la última versión); sin señal, la última guardada.
// - /assets (archivos con hash, no cambian nunca): primero lo guardado.
// - Fuentes de Google: lo guardado y se actualiza de fondo.
// - /api: nunca se guarda acá (los datos los guarda la app; las cargas sin señal van a su cola).
// ignoreVary: el servidor manda "Vary: Origin" y los scripts se piden con otro Origin que cuando se guardaron.
const CACHE = 'moldeados-v1';
const INICIALES = ['/', '/index.html', '/logo.webp', '/logo.png', '/manifest.webmanifest'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(INICIALES)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.pathname.startsWith('/api')) return;
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).then((r) => { const copia = r.clone(); caches.open(CACHE).then((c) => c.put('/index.html', copia)); return r; })
      .catch(() => caches.match("/index.html", { ignoreVary: true })));
    return;
  }
  if (url.origin === location.origin && url.pathname.startsWith('/assets/')) {
    e.respondWith(caches.match(req, { ignoreVary: true }).then((hit) => hit || fetch(req).then((r) => { const copia = r.clone(); caches.open(CACHE).then((c) => c.put(req, copia)); return r; })));
    return;
  }
  if (url.hostname.endsWith('fonts.googleapis.com') || url.hostname.endsWith('fonts.gstatic.com') || url.origin === location.origin) {
    e.respondWith(caches.match(req, { ignoreVary: true }).then((hit) => {
      const red = fetch(req).then((r) => { if (r.ok || r.type === 'opaque') { const copia = r.clone(); caches.open(CACHE).then((c) => c.put(req, copia)); } return r; }).catch(() => hit);
      return hit || red;
    }));
  }
});

// Avisos con la app cerrada (Web Push): el servidor manda título, detalle y a qué pantalla lleva.
self.addEventListener('push', (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { d = { titulo: e.data ? e.data.text() : '' }; }
  e.waitUntil(self.registration.showNotification(d.titulo || 'Moldeados Córdoba', {
    body: d.detalle || '',
    icon: '/logo.png',
    badge: '/logo.png',
    data: { ruta: d.ruta || '/' },
  }));
});
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const ruta = (e.notification.data && e.notification.data.ruta) || '/';
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((ws) => {
    const w = ws[0];
    if (w) return w.focus().then((f) => (f && 'navigate' in f ? f.navigate(ruta) : undefined));
    return self.clients.openWindow(ruta);
  }));
});
