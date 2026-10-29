# Scopa e Scopone

Le carte napoletane da 40, contro il computer. **Webapp in un singolo file**: niente
build, funziona anche offline (senza rete i caratteri ripiegano su quelli di sistema).

## Come si gioca

- **Scopa**: tu contro Tonino. Tre carte a testa, quattro in tavola, si gioca a 11.
- **Scopone**: tu e Rosa contro Gino e Peppe, in senso antiorario, si gioca a 21.
  Scientifico (10 carte a testa, tavola vuota) o classico (9 carte e 4 in tavola).
- Tocca una carta della mano. Se c'è una sola presa possibile la fa subito; se ce ne
  sono più di una, scegli quale dai pulsanti sotto la tavola oppure toccando le carte.
- **Consiglio** mostra la mossa che giocherebbe un avversario esperto.

## Regole

- La presa è obbligatoria; la carta dello stesso valore ha la precedenza sulle somme.
- Svuotare la tavola vale una scopa, tranne con l'ultima carta della smazzata.
- A fine smazzata le carte rimaste vanno a chi ha preso per ultimo.
- Con tre re in tavola alla distribuzione si rimischia.
- Punti: carte (più di 20), denari (più di 5), settebello, primiera, scope.
  Primiera: 7 = 21, 6 = 18, Asso = 16, 5 = 15, 4 = 14, 3 = 13, 2 = 12, figure = 10.
- Varianti facoltative: **asso piglia tutto** e **napola** (Asso, 2 e 3 di Denari
  valgono 3 punti, più uno per ogni denaro in scala).
- Pareggio oltre il traguardo: si gioca un'altra smazzata.

## Avversari

Tre livelli. I **facili** sbagliano spesso apposta. I **medi** pesano il valore delle
prese e il rischio di lasciare la scopa. Gli **esperti** contano anche le carte già
uscite per stimare cosa ha in mano chi gioca dopo.

## Provarlo

- **Online**: `https://giochi.bacchin.app/scopa/`
- **In locale**: `python3 -m http.server` dentro questa cartella, poi `http://localhost:8000`.

## File

| File | Ruolo |
| --- | --- |
| `index.html` | Tutto il gioco: markup, CSS, regole e avversari |
| `carte/` | Le 40 carte e il dorso, WebP 320×529 |
| `manifest.webmanifest` | Metadati PWA |
| `sw.js` | Service worker per l'uso offline |
| `icon-180.png` / `icon-512.png` | Icone per home screen e install |

## Le carte

Scansioni del mazzo napoletano pubblicate su Wikimedia Commons da Trocche100
(it.wikipedia), con licenza dichiarata **pubblico dominio** (`PD-user-it`):
da «01 Asso di denari.jpg» a «40 Dieci di Bastoni.jpg» e «Carte Napoletane retro.jpg»,
categoria <https://commons.wikimedia.org/wiki/Category:Naples_deck>.
Le copie usate qui corrispondono byte per byte agli originali di Commons (SHA-1).
Modifiche: ridotte a 320×529, portate su un fondo color carta, il dorso ritagliato
alle proporzioni delle carte e virato in rosso scuro.

Sono scansioni di un mazzo stampato moderno: l'Asso di Denari porta la scritta
«Dal Negro Treviso». Il disegno napoletano ha secoli, ma il pubblico dominio di
queste immagini si basa solo sulla dichiarazione di chi le ha caricate.
