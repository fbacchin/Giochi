# Tetris 🧱

Il pozzo, i sette pezzi, le righe da chiudere. **Webapp in un singolo file**: niente
dipendenze, niente build, funziona anche offline.

## Come si gioca

- **Desktop**: ← → per spostare, **↑** o **X** per ruotare in senso orario, **Z** in senso
  antiorario, ↓ per la discesa morbida, **spazio** per la caduta secca, **C** per mettere il
  pezzo da parte, **P** (o Esc) pausa, **Invio** per cominciare.
- **iPhone / iPad**: pulsantiera sotto il pozzo — sposta, ruota nei due versi, tieni il pezzo
  da parte, cala subito.
- Le righe complete spariscono; più ne chiudi in una volta, più valgono. Il livello sale
  ogni dieci righe e i pezzi scendono più in fretta.

## Caratteristiche

- Pezzo fantasma, anteprima dei **prossimi** pezzi, pezzo **da parte** (hold), punteggio e livello.
- Ripetizione automatica alla mossa laterale (DAS/ARR) come nei cabinati.
- Audio sintetizzato, disattivabile; la scelta resta salvata sul dispositivo.
- Tema indaco/ambra dichiarato per intero: la pagina non eredita mai i colori dell'host.
- PWA: manifest, service worker, icone — installabile e giocabile offline.

## Provarlo

- **Online**: `https://fbacchin.github.io/Giochi/tetris/`
- **In locale**: `python3 -m http.server` dentro questa cartella, poi `http://localhost:8000`.

## File

| File | Ruolo |
| --- | --- |
| `index.html` | Tutto il gioco: markup, CSS, motore |
| `manifest.webmanifest` | Metadati PWA |
| `sw.js` | Service worker cache-first per l'uso offline |
| `icon-180.png` / `icon-512.png` | Icone per home screen e install |
