/* Service worker: la pagina si aggiorna da sola, il gioco resta giocabile senza rete.
   La versione della cache è un'impronta del contenuto, allineata da aggiorna-cache.sh:
   cambia a ogni modifica del gioco, così la copia vecchia non resta mai sul dispositivo. */
const CACHE = 'giochi-scopa-0cb87879eb';
const CARTE = ['D1', 'D2', 'D3', 'D4', 'D5', 'D6', 'D7', 'D8', 'D9', 'D10', 'C1', 'C2', 'C3', 'C4', 'C5', 'C6', 'C7', 'C8', 'C9', 'C10', 'S1', 'S2', 'S3', 'S4', 'S5', 'S6', 'S7', 'S8', 'S9', 'S10', 'B1', 'B2', 'B3', 'B4', 'B5', 'B6', 'B7', 'B8', 'B9', 'B10', 'back'].map(id => 'carte/' + id + '.webp');
const SUONI = ['capture1', 'capture2', 'capture3', 'deal1', 'deal2', 'place1', 'place2', 'place3', 'place4', 'scopa', 'shuffle', 'win'].map(n => 'suoni/' + n + '.mp3');
const ASSETS = ['.', 'index.html', 'manifest.webmanifest', 'icon-180.png', 'icon-512.png', ...CARTE, ...SUONI];

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
