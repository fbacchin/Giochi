# Pong 🏓

Il classico da bar, scritto come **webapp in un singolo file**: niente dipendenze, niente
build, funziona anche offline. Contro il computer o in due sullo stesso schermo.

## Come si gioca

- **iPhone / iPad**: trascina il dito sullo schermo, dalla tua metà campo. Il movimento è
  **relativo** — la racchetta parte da dov'è e segue il dito uno a uno, senza saltare sotto
  il pollice. Sui dispositivi touch le racchette stanno **staccate dal bordo**, così puoi
  spingerle da dietro senza coprirle con la mano.
- **Desktop**: mouse per il giocatore di sinistra; in due giocatori, **W/S** a sinistra e
  **↑/↓** a destra.
- Si vince a **11 punti**, con **due di scarto**.

## Il computer

Tre livelli, che non cambiano solo la velocità della racchetta ma il modo di giocare:

| Livello | Come gioca |
| --- | --- |
| Facile | Parte tardi, sbaglia la mira, e ogni tanto lascia proprio perdere lo scambio |
| Normale | Reagisce in fretta ma resta imperfetto: si può battere |
| Difficile | Legge il rimbalzo, si rimette al centro, non regala niente |

La difficoltà è stata misurata facendo giocare un "umano simulato" con 150 ms di ritardo di
reazione: a *Facile* vince l'umano, a *Difficile* vince la macchina.

## Caratteristiche

- Fisica a passo fisso (240 Hz) con collisioni **continue**: la palla non attraversa mai la
  racchetta, nemmeno alla massima velocità.
- Campo in unità logiche indipendenti dallo schermo: si adatta a orizzontale e verticale,
  ruotando il campo nel modo giusto anche a metà scambio.
- Altezza calcolata su `visualViewport`, così la barra di Safari non mangia il fondo campo.
- **Classifica locale**: pulsante *Classifica* nella schermata di avvio, con le ultime
  partite e il record dello scambio più lungo. Sta sul dispositivo (`localStorage`).
- Audio sintetizzato con Web Audio API, disattivabile.
- PWA completa: manifest, service worker, icone — installabile e giocabile offline.

## Provarlo

- **Online**: `https://fbacchin.github.io/Giochi/pong/`
- **In locale**: `python3 -m http.server` dentro questa cartella, poi `http://localhost:8000`.

## File

| File | Ruolo |
| --- | --- |
| `index.html` | Tutto il gioco: markup, CSS, motore, IA, audio |
| `manifest.webmanifest` | Metadati PWA (nome, icone, standalone) |
| `sw.js` | Service worker cache-first per l'uso offline |
| `icon-*.png` | Icone per home screen, install e scheda del browser |
| `Pong.PNG` | Immagine sorgente da cui sono ricavate le icone |
