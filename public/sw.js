/**
 * public/sw.js
 * Service Worker Nativo para FinScope v3.1 (PWA 100% Offline-First)
 * Estrategia: Cache-First con fallback a Red para el App Shell y activos estáticos.
 */

const CACHE_NAME = 'finscope-cache-v3.1.0';

// App Shell y recursos esenciales a precachear
const PRECACHE_ASSETS = [
  './',
  './index.html',
  './styles.css',
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

// 3. Estrategia de Fetch: Cache-First, fallback a Network
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

  event.respondWith(
    caches.match(request).then(cachedResponse => {
      if (cachedResponse) {
        // Retornar de caché inmediatamente (Cache-First)
        // Actualizar en segundo plano si es posible (Stale-While-Revalidate selectivo)
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
          // Si es una petición de navegación (HTML) y la red falló, servir index.html de caché
          if (request.mode === 'navigate') {
            return caches.match('./index.html') || caches.match('./');
          }
          return new Response('Recurso no disponible sin conexión.', {
            status: 503,
            statusText: 'Service Unavailable',
            headers: new Headers({ 'Content-Type': 'text/plain; charset=utf-8' })
          });
        });
    })
  );
});
