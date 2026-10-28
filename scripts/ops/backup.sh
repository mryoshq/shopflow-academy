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
  ts="$(date -u +%Y%m%d-%H%M%S)"
  part="$DIR/.academy-$ts.part"
  final="$DIR/academy-$ts-auto.dump"
  pg_dump -h postgres -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc -f "$part"
  pg_restore --list "$part" > /dev/null
  mv "$part" "$final"
  (cd "$DIR" && sha256sum "$(basename "$final")" > "$(basename "$final").sha256")
  bytes="$(wc -c < "$final" | tr -d ' ')"
  printf '{"at":"%s","file":"%s","bytes":%s}\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$(basename "$final")" "$bytes" > "$DIR/last-backup.json"
  ls -1t "$DIR"/academy-*-auto.dump 2>/dev/null | tail -n +"$((KEEP + 1))" | while read -r old; do
    rm -f "$old" "$old.sha256"
  done
  echo "backup ok: $(basename "$final") ($bytes bytes)"
}

if [ "${1:-loop}" = "once" ]; then
  backup_once
  exit 0
fi
while true; do
  backup_once || echo "backup FAILED at $(date -u +%Y-%m-%dT%H:%M:%SZ)" >&2
  sleep "$((INTERVAL * 3600))"
done
