/* Service worker: la pagina si aggiorna da sola, il gioco resta giocabile senza rete.
   La versione della cache è un'impronta del contenuto, allineata da aggiorna-cache.sh:
   cambia a ogni modifica del gioco, così la copia vecchia non resta mai sul dispositivo. */
const CACHE = 'giochi-laser-invaders-f4ec215bd0';
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

/* 'reload' salta anche la cache HTTP del browser: senza, una copia che il browser
   considera ancora fresca terrebbe fuori l'aggiornamento appena pubblicato. */
function daRete(req) {
  try { return fetch(req, { cache: 'reload' }); }
  catch (err) { return fetch(req); }
}

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  /* quel che sta fuori da qui (per esempio la classifica condivisa) non passa mai
     dalla cache: sempre dati freschi */
  if (url.origin !== location.origin) return;

  const isPagina = e.request.mode === 'navigate' ||
                   url.pathname.endsWith('/') ||
                   url.pathname.endsWith('index.html');
  const isCodice = /\.(js|css)$/.test(url.pathname);

  if (isPagina || isCodice) {
    /* pagina e codice arrivano dalla rete quando c'è: le modifiche si vedono al primo
       caricamento e restano in sincronia fra loro. Senza rete si usa la copia salvata. */
    e.respondWith(
      daRete(e.request)
        .then(res => {
          if (res.ok) {
            const copia = res.clone();
            caches.open(CACHE).then(c => c.put(e.request, copia));
          }
          return res;
        })
        .catch(() => caches.match(e.request, { ignoreSearch: true })
          .then(hit => hit || (isPagina ? caches.match('index.html') : undefined)))
    );
    return;
  }

  /* icone, manifest e immagini: prima la copia salvata, cambiano con la versione della cache */
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
