// Guarda la app en el teléfono para que abra aunque no haya internet.
// Si cambias algún archivo de la app, sube este número (v2, v3…) para que todos reciban la versión nueva.
const VERSION = "presupuesto-v9";
const SHELL = ["./","index.html","app.js","engine.js","ahorros.js","prestamos.js","firebase-config.js","manifest.webmanifest","icons/icon-192.png","icons/icon-512.png","icons/logo.svg"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  // Nunca interceptar el inicio de sesión ni la base de datos
  if (url.hostname.includes("googleapis.com") && !url.hostname.startsWith("fonts.")) return;
  if (url.hostname.endsWith("firebaseapp.com") || url.pathname.startsWith("/__/")) return;
  const isApp = url.origin === location.origin;
  const isLib = url.hostname === "www.gstatic.com" || url.hostname.startsWith("fonts.");
  if (!isApp && !isLib) return;
  if (isApp) {
    // Primero internet (para recibir cambios), y si no hay, la copia guardada
    e.respondWith(fetch(req).then(r => { const cp = r.clone(); caches.open(VERSION).then(c => c.put(req, cp)); return r; })
      .catch(() => caches.match(req).then(r => r || caches.match("index.html"))));
  } else {
    // Librerías y fuentes: la copia guardada primero
    e.respondWith(caches.match(req).then(r => r || fetch(req).then(res => { const cp = res.clone(); caches.open(VERSION).then(c => c.put(req, cp)); return res; })));
  }
});
