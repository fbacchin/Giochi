# Laser Invaders 🚀

Sparatutto arcade stile anni '80: squadriglie di astronavi nemiche arrivano in picchiata
**1, 2 o 3 alla volta** — abbattile col laser e raccogli le capsule **[P]** per potenziarlo:
singolo → **doppio** → **triplo**. Scritto come **webapp in un singolo file** — niente
dipendenze, niente build, funziona anche offline.

## Come si gioca

- **Desktop**: frecce ← → ↑ ↓ (o WASD) per muovere in ogni direzione — anche in
  diagonale — **SPAZIO** per sparare (tieni premuto: fuoco automatico), **P** pausa,
  **M** audio.
- **iPhone / iPad**: trascina il dito in qualsiasi punto dello schermo per muovere la
  navicella in ogni direzione (movimento relativo: il dito non copre mai la nave);
  un unico pulsante, **FUOCO** — tienilo premuto per sparare a raffica.
- Ogni 7 astronavi abbattute cade una capsula **[P]**. La scala dei potenziamenti sale
  sempre, senza mai tornare indietro: laser singolo → doppio → triplo, poi arriva un
  **drone gregario** che vola al tuo fianco e spara con te, poi un **secondo drone**,
  e da lì in poi ogni capsula aumenta la **cadenza di fuoco** (fino a raddoppiarla).
- Se vieni colpito perdi una vita e scendi di un gradino nella scala.
- **Alla fine di ogni livello arriva il mostro**: dopo 12 astronavi abbattute scatta
  l'allarme e compare un'enorme testata corazzata con occhi e zanne. Spazza lo schermo,
  ogni tanto ti piomba addosso in picchiata e sputa ventagli di colpi — sempre più
  spesso e più veloce man mano che perde energia (la barra rossa in alto). Abbattilo per
  passare al livello successivo: vale da 750 punti in su e lascia cadere due capsule.
- Vita extra ogni 2.500 punti.
- **Classifica mondiale condivisa**: a fine partita, se rientri nei migliori 10, registri
  le tue **iniziali di 3 lettere** — si scrivono da tastiera oppure toccando l'alfabeto
  sullo schermo, con `<` per cancellare. La tabella dei **migliori 10** è la stessa per
  tutti i giocatori: scorre nella schermata iniziale alternandosi alle istruzioni, come
  nei cabinati veri. Senza rete il gioco continua con la classifica del dispositivo e
  spedisce il punteggio da solo appena la connessione torna.

## Le astronavi

| Nave | Comportamento | Colpi | Punti |
| --- | --- | --- | --- |
| Caccia (ciano) | Picchiata a serpentina, veloce | 1 | 50 |
| Incrociatore (magenta) | Attraversa lo schermo planando | 2 | 100 |
| Nave pesante (ambra) | Scende lenta a zig-zag | 3 | 150 |

## Caratteristiche

- Estetica CRT autentica: scanline, maschera RGB, vignettatura, accensione del tubo catodico.
- Audio 100% sintetizzato con Web Audio API: esplosioni, battito di fondo che accelera col
  livello, e **4 timbri per il laser** selezionabili in gioco (pulsante in alto o tasto L):
  **RETRO ZAP** (quadra graffiante da cabinato), **SYNTH SWEEP** (il "fiu fiu" morbido alla
  "I Don't Feel Like Dancin'" degli Scissor Sisters), **UI CLICK** (tick sci-fi brevissimo),
  **8BIT SHOOT** (chip a gradini stile NES). La scelta resta salvata sul dispositivo.
- Font pixel (Press Start 2P) incorporato in base64: nessuna richiesta esterna.
- PWA completa: manifest, service worker, icone — installabile e giocabile offline.

## Provarlo

- **Online**: `https://fbacchin.github.io/Giochi/laser-invaders/`
- **In locale**: `python3 -m http.server` dentro questa cartella, poi apri `http://localhost:8000`.
  (Aprire `index.html` direttamente funziona lo stesso; solo il service worker resta disattivo.)

## Passaggio ad app iPhone/iPad (fase 2)

Due strade, in ordine di sforzo:

1. **Subito, senza App Store** — apri l'URL in Safari su iPhone/iPad →
   Condividi → *Aggiungi alla schermata Home*. Grazie al manifest si apre a tutto schermo,
   con la sua icona, e funziona offline: di fatto è già un'app.
2. **App Store** — impacchettare questa stessa webapp con
   [Capacitor](https://capacitorjs.com) (`npx cap add ios`) in un progetto Xcode:
   il gioco gira in una WKWebView senza modifiche al codice. Servono un Mac con Xcode
   e l'account Apple Developer. Il codice è già pronto per questo passaggio
   (viewport con safe-area, audio sbloccato al primo tocco, controlli touch, niente risorse esterne).

## Come funziona la classifica condivisa

La pagina è statica (GitHub Pages non può ricevere dati), quindi i punteggi vivono in una
tabella Postgres su Supabase, condivisa da tutti i giochi del repo:

| Aspetto | Scelta |
| --- | --- |
| Tabella | `public.arcade_scores` — colonna `game` per tenere separate le classifiche |
| Chiave nella pagina | chiave *publishable*, pensata per stare nel client |
| Permessi | lettura e sola aggiunta; **modifica e cancellazione vietate** dal database |
| Validazione | vincoli SQL su iniziali (`A-Z0-9-`, max 3), punteggio e livello |
| Anti-flood | massimo 30 registrazioni al minuto |
| Senza rete | si gioca lo stesso: classifica locale e invio differito (fino a 5 in coda) |

Per aggiungere un altro gioco alla stessa classifica basta usare un valore diverso di
`game` nelle chiamate REST.

## File

| File | Ruolo |
| --- | --- |
| `index.html` | Tutto il gioco: markup, CSS CRT, motore, sprite, audio |
| `manifest.webmanifest` | Metadati PWA (nome, icone, fullscreen, orientamento) |
| `sw.js` | Service worker cache-first per l'uso offline |
| `icon-180.png` / `icon-512.png` | Icone per home screen e install |
