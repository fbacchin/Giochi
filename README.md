# Giochi
Repo per i giochi

| Gioco | Cartella | Gioca |
|---|---|---|
| Assalto alla Morte Nera | [`guerre-stellari/`](guerre-stellari/) | https://giochi.bacchin.app/guerre-stellari/ |
| Laser Invaders | [`laser-invaders/`](laser-invaders/) | https://giochi.bacchin.app/laser-invaders/ |
| Pong | [`pong/`](pong/) | https://giochi.bacchin.app/pong/ |
| Tetris | [`tetris/`](tetris/) | https://giochi.bacchin.app/tetris/ |

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


## Indirizzi

Dal 21 settembre 2026 i giochi sono su **https://giochi.bacchin.app** (Cloudflare Pages, pubblica da questo repository a ogni push su `main`). Restano raggiungibili anche su `https://fbacchin.github.io/Giochi/`: chi li ha installati sulla schermata Home da lì continua a usare quell'indirizzo, e il record di Assalto alla Morte Nera resta salvato su quel dominio.
