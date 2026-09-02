# Giochi
Repo per i giochi

| Gioco | Cartella | Gioca |
|---|---|---|
| Assalto alla Morte Nera | [`guerre-stellari/`](guerre-stellari/) | https://fbacchin.github.io/Giochi/guerre-stellari/ |
| Laser Invaders | [`laser-invaders/`](laser-invaders/) | https://fbacchin.github.io/Giochi/laser-invaders/ |
| Pong | [`pong/`](pong/) | https://fbacchin.github.io/Giochi/pong/ |
| Tetris | [`tetris/`](tetris/) | https://fbacchin.github.io/Giochi/tetris/ |

## Versione della cache

Ogni gioco ha un service worker che lo rende giocabile senza rete. Prima di pubblicare
una modifica va allineata la versione della cache, altrimenti i dispositivi che hanno
già aperto il gioco continuano a vedere la copia salvata:

```sh
./aggiorna-cache.sh          # tutti i giochi
./aggiorna-cache.sh tetris   # un gioco solo
```

La versione è un'impronta del contenuto, quindi cambia solo quando cambia davvero
ciò che viene servito al giocatore: modificare un README non tocca la cache e non
fa riscaricare nulla ai dispositivi. In Tetris la pagina viene inoltre richiesta alla rete quando c'è, così una
modifica pubblicata si vede già al primo caricamento.

## Pubblicazione

Il sito è servito da GitHub Pages dal ramo `main`, cartella radice: si spinge su `main`
e il sito si aggiorna da solo, senza altri passaggi.
