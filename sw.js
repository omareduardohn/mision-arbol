const CACHE = 'mision-arbol-v25';
const ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/css/estilo.css',
  '/data/comunas_y_consejos.json',
  '/js/firebase-config.js',
  '/js/territorioCache.js',
  '/js/datos.js',
  '/js/auth.js',
  '/js/navegacion.js',
  '/js/admin.js',
  '/js/dashboard.js',
  '/js/personal.js',
  '/js/planificacion.js',
  '/js/viveros.js',
  '/js/bancosTierra.js',
  '/js/brigadas.js',
  '/js/formaciones.js',
  '/js/reportesCumplimiento.js',
  '/js/reportesEspeciales.js'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then(async (cache) => {
      for (const url of ASSETS) {
        try { await cache.add(url); }
        catch (err) { console.warn('No se pudo cachear:', url); }
      }
      self.skipWaiting();
    })
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;

  const DOMINIOS_EXTERNOS = [
    'googleapis.com',
    'firebaseio.com',
    'firebaseapp.com',
    'gstatic.com',
    'jsdelivr.net',
    'cdnjs.cloudflare.com',
    'i.ibb.co'
  ];

  if (DOMINIOS_EXTERNOS.some(d => e.request.url.includes(d))) return;
  if (e.request.url.includes('chart.js')) return;

  e.respondWith(
    caches.match(e.request).then(cached => {
      return cached || fetch(e.request).then(res => {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, copy)).catch(() => {});
        return res;
      }).catch(() => caches.match('/index.html'));
    })
  );
});