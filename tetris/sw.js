/* Service worker: la pagina si aggiorna da sola, il gioco resta giocabile senza rete.
   La versione della cache è un'impronta del contenuto, allineata da aggiorna-cache.sh:
   cambia a ogni modifica del gioco, così la copia vecchia non resta mai sul dispositivo. */
const CACHE = 'giochi-tetris-5cfe4a285e';
const ASSETS = ['.', 'index.html', 'manifest.webmanifest', 'icon-180.png', 'icon-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  if (url.origin !== location.origin) return;

  const isPagina = e.request.mode === 'navigate' ||
                   url.pathname.endsWith('/') ||
                   url.pathname.endsWith('index.html');

  if (isPagina) {
    /* la pagina arriva dalla rete quando c'è: le modifiche si vedono al primo caricamento,
       e senza rete si ripiega sulla copia salvata */
    e.respondWith(
      fetch(e.request)
        .then(res => {
          if (res.ok) {
            const copia = res.clone();
            caches.open(CACHE).then(c => c.put(e.request, copia));
          }
          return res;
        })
        .catch(() => caches.match(e.request, { ignoreSearch: true })
          .then(hit => hit || caches.match('index.html')))
    );
    return;
  }

  /* icone e manifest: prima la copia salvata, cambiano solo con la versione della cache */
  e.respondWith(
    caches.match(e.request, { ignoreSearch: true }).then(hit =>
      hit ||
      fetch(e.request).then(res => {
        if (res.ok) {
          const copia = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, copia));
        }
        return res;
      })
    )
  );
});
