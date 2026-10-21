/**
 * public/sw.js
 * Service Worker Nativo para FinScope v3.1 (PWA 100% Offline-First)
 * Estrategia: Cache-First con fallback a Red para el App Shell y activos estáticos.
 */

const CACHE_NAME = 'finscope-cache-v3.1.1';

// App Shell y recursos esenciales a precachear
const PRECACHE_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icons/icon-192x192.png',
  './icons/icon-512x512.png'
];

// 1. Ciclo de Vida: Instalación & Precache
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      console.log('[SW] Precacheando App Shell y assets estáticos...');
      // Usar cache.addAll de forma tolerante a fallos
      return Promise.allSettled(
        PRECACHE_ASSETS.map(url => cache.add(url))
      );
    }).then(() => self.skipWaiting())
  );
});

// 2. Ciclo de Vida: Activación y Limpieza de Caches Obsoletas
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames
          .filter(name => name !== CACHE_NAME)
          .map(name => {
            console.log('[SW] Purgando caché obsoleta:', name);
            return caches.delete(name);
          })
      );
    }).then(() => self.clients.claim())
  );
});

// 3. Estrategia de Fetch
self.addEventListener('fetch', event => {
  const request = event.request;

  // Ignorar métodos no GET
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Ignorar APIs externas, Google Identity, Firebase o Firestore
  if (
    url.origin.includes('google') ||
    url.origin.includes('firebase') ||
    url.origin.includes('googleapis') ||
    url.origin.includes('gstatic')
  ) {
    return;
  }

  // 3.1 Peticiones de Navegación (HTML / App Shell): Network-First con fallback a caché
  // Garantiza que tras cada nuevo despliegue de Vite el usuario reciba el HTML más reciente
  // con los hashes de scripts actualizados, evitando páginas congeladas o desactualizadas.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then(networkResponse => {
          if (networkResponse && networkResponse.status === 200) {
            const copy = networkResponse.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(request, copy));
          }
          return networkResponse;
        })
        .catch(async () => {
          const cached = (await caches.match('./index.html')) || (await caches.match('./')) || (await caches.match(request));
          if (cached) return cached;
          return new Response('FinScope está fuera de línea.', {
            status: 503,
            statusText: 'Service Unavailable',
            headers: new Headers({ 'Content-Type': 'text/plain; charset=utf-8' })
          });
        })
    );
    return;
  }

  // 3.2 Activos estáticos, chunks JS y CSS: Cache-First con Stale-While-Revalidate
  event.respondWith(
    caches.match(request).then(cachedResponse => {
      if (cachedResponse) {
        // Retornar de caché inmediatamente (Cache-First)
        // Actualizar en segundo plano si es posible (Stale-While-Revalidate)
        fetch(request)
          .then(networkResponse => {
            if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
              caches.open(CACHE_NAME).then(cache => cache.put(request, networkResponse.clone()));
            }
          })
          .catch(() => {/* Operación offline transparente */});

        return cachedResponse;
      }

      // Si no está en caché, solicitar a la red
      return fetch(request)
        .then(networkResponse => {
          if (!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic') {
            return networkResponse;
          }

          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then(cache => {
            cache.put(request, responseToCache);
          });

          return networkResponse;
        })
        .catch(() => {
          return new Response('Recurso no disponible sin conexión.', {
            status: 503,
            statusText: 'Service Unavailable',
            headers: new Headers({ 'Content-Type': 'text/plain; charset=utf-8' })
          });
        });
    })
  );
});
