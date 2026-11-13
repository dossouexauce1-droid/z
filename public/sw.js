// Rend Z utilisable hors connexion une fois ouvert.
// Les gros fichiers qui ne changent pas (modèles, moteur, polices) sont servis depuis le cache.
// Le reste est demandé au réseau d'abord, pour toujours avoir la dernière version.
const CACHE = 'z-v1';
const HEAVY = /\/(models|vendor|icons)\/|fonts\.(googleapis|gstatic)\.com/;

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const keep = async (response) => {
    if (response.ok || response.type === 'opaque') (await caches.open(CACHE)).put(request, response.clone());
    return response;
  };
  if (HEAVY.test(request.url)) {
    event.respondWith(caches.match(request).then((hit) => hit ?? fetch(request).then(keep)));
  } else if (new URL(request.url).origin === location.origin) {
    event.respondWith(fetch(request).then(keep).catch(() => caches.match(request, { ignoreSearch: true })));
  }
});
