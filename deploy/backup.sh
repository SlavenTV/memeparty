#!/usr/bin/env bash
# Sichert Datenbank, Redis und Uploads nach ./backups (Standard: 14 Tage Aufbewahrung).
set -euo pipefail
cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.."

BACKUP_DIR=${BACKUP_DIR:-./backups}
RETENTION_DAYS=${RETENTION_DAYS:-14}
STAMP=$(date +%Y%m%d-%H%M%S)
mkdir -p "$BACKUP_DIR"

echo "== PostgreSQL dump =="
docker compose exec -T postgres pg_dump -U memeparty -d memeparty --clean --if-exists \
    | gzip > "$BACKUP_DIR/db-$STAMP.sql.gz"
test -s "$BACKUP_DIR/db-$STAMP.sql.gz" || { echo "FEHLER: Dump ist leer." >&2; exit 1; }

echo "== Redis snapshot =="
docker compose exec -T redis redis-cli BGSAVE >/dev/null
for _ in $(seq 1 20); do
    if docker compose exec -T redis redis-cli --raw INFO persistence 2>/dev/null | grep -q 'rdb_bgsave_in_progress:0'; then
        break
    fi
    sleep 1
done
docker compose cp redis:/data/dump.rdb "$BACKUP_DIR/redis-$STAMP.rdb" >/dev/null

echo "== Uploads =="
TMP_UPLOADS=$(mktemp -d)
docker compose cp backend:/app/data/uploads/. "$TMP_UPLOADS" >/dev/null 2>&1 || true
tar czf "$BACKUP_DIR/uploads-$STAMP.tar.gz" -C "$TMP_UPLOADS" . 2>/dev/null || true
rm -rf "$TMP_UPLOADS"

echo "== Alte Backups entfernen (aelter als $RETENTION_DAYS Tage) =="
find "$BACKUP_DIR" -type f -mtime "+$RETENTION_DAYS" -delete

ls -lh "$BACKUP_DIR" | tail -n 8
echo "Fertig. Offsite-Kopie (rsync/rclone) wird empfohlen; dieselbe Platte ist kein Backup."
