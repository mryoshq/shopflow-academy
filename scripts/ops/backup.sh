#!/bin/sh
# Automatic PostgreSQL backups for ShopFlow Academy (runs in the "backup" Compose service).
#   loop (default): one backup at start, then every BACKUP_INTERVAL_HOURS
#   once          : a single backup (docker compose exec backup sh /ops/backup.sh once)
# Each dump is verified with pg_restore --list before being kept. Only "*-auto.dump"
# files are rotated (BACKUP_KEEP newest kept); manual backups are never deleted.
set -eu
DIR=/backups
KEEP="${BACKUP_KEEP:-28}"
INTERVAL="${BACKUP_INTERVAL_HOURS:-6}"
umask 077

backup_once() {
  # Every step is checked explicitly: `set -e` does not apply inside a function called as `backup_once || …`,
  # and an empty dump was once recorded as « backup ok » (29/10 and 05/11/2026, PostgreSQL not ready yet).
  ts="$(date -u +%Y%m%d-%H%M%S)"
  part="$DIR/.academy-$ts.part"
  final="$DIR/academy-$ts-auto.dump"
  if ! pg_dump -h postgres -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc -f "$part"; then rm -f "$part"; return 1; fi
  if [ ! -s "$part" ] || ! pg_restore --list "$part" > /dev/null; then rm -f "$part"; return 1; fi
  mv "$part" "$final" || return 1
  (cd "$DIR" && sha256sum "$(basename "$final")" > "$(basename "$final").sha256") || return 1
  bytes="$(wc -c < "$final" | tr -d ' ')"
  printf '{"at":"%s","file":"%s","bytes":%s}\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$(basename "$final")" "$bytes" > "$DIR/last-backup.json"
  ls -1t "$DIR"/academy-*-auto.dump 2>/dev/null | tail -n +"$((KEEP + 1))" | while read -r old; do
    rm -f "$old" "$old.sha256"
  done
  echo "backup ok: $(basename "$final") ($bytes bytes)"
}

wait_for_postgres() {
  i=0
  until pg_isready -q -h postgres -U "$POSTGRES_USER" -d "$POSTGRES_DB"; do
    i=$((i + 1))
    [ "$i" -ge 60 ] && return 1
    sleep 5
  done
}

if [ "${1:-loop}" = "once" ]; then
  wait_for_postgres || { echo "backup FAILED: PostgreSQL unreachable" >&2; exit 1; }
  backup_once || { echo "backup FAILED at $(date -u +%Y-%m-%dT%H:%M:%SZ)" >&2; exit 1; }
  exit 0
fi
while true; do
  if wait_for_postgres && backup_once; then
    sleep "$((INTERVAL * 3600))"
  else
    # A failed backup is retried 5 minutes later instead of waiting for the next interval.
    echo "backup FAILED at $(date -u +%Y-%m-%dT%H:%M:%SZ), retry in 5 min" >&2
    sleep 300
  fi
done
