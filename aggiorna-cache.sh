#!/bin/sh
# Allinea la versione della cache dei service worker al contenuto dei giochi.
#
#   ./aggiorna-cache.sh            controlla tutti i giochi
#   ./aggiorna-cache.sh tetris     controlla un gioco solo
#
# La versione è un'impronta del contenuto: cambia solo quando cambia davvero
# ciò che viene servito al giocatore (la documentazione .md non conta). Dopo la
# pubblicazione il service worker vede una versione nuova, butta la copia salvata
# sul dispositivo e serve il gioco aggiornato.
# Da eseguire prima di ogni commit che tocca un gioco.
set -eu
cd "$(dirname "$0")"

impronta_di() {
  if command -v shasum >/dev/null 2>&1; then shasum; else sha1sum; fi
}

aggiorna_gioco() {
  gioco=${1%/}
  sw="$gioco/sw.js"
  if [ ! -f "$sw" ]; then
    echo "  $gioco: nessun service worker, saltato"
    return 0
  fi
  # l'impronta copre nomi e contenuto di ciò che viene servito al giocatore:
  # fuori il service worker stesso e la documentazione, che non fa parte del gioco
  elenco=$(find "$gioco" -type f ! -name sw.js ! -name '*.md' | LC_ALL=C sort)
  nuova="giochi-$gioco-$( { printf '%s\n' "$elenco"; printf '%s\n' "$elenco" | xargs cat; } | impronta_di | cut -c1-10 )"
  vecchia=$(sed -n "s/^const CACHE = '\(.*\)';\$/\1/p" "$sw")
  if [ "$vecchia" = "$nuova" ]; then
    echo "  $gioco: già allineato ($vecchia)"
    return 0
  fi
  tmp=$(mktemp)
  sed "s/^const CACHE = '.*';\$/const CACHE = '$nuova';/" "$sw" > "$tmp" && mv "$tmp" "$sw"
  echo "  $gioco: $vecchia -> $nuova"
}

if [ $# -gt 0 ]; then
  giochi=$*
else
  giochi=$(for d in */; do [ -f "$d/sw.js" ] && printf '%s ' "${d%/}"; done)
fi

echo "Versione della cache:"
for g in $giochi; do aggiorna_gioco "$g"; done
