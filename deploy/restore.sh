#!/usr/bin/env bash
# Stellt Datenbank und Uploads aus einem Backup wieder her.
#   ./deploy/restore.sh backups/db-20261115-030000.sql.gz [backups/uploads-....tar.gz]
set -euo pipefail
cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.."

DB_FILE=${1:-}
UPLOADS_FILE=${2:-}
if [[ -z "$DB_FILE" || ! -f "$DB_FILE" ]]; then
    echo "Aufruf: ./deploy/restore.sh <db-*.sql.gz> [uploads-*.tar.gz]" >&2
    ls -1 backups 2>/dev/null | tail -n 10 >&2 || true
    exit 1
fi

echo "WARNUNG: Die laufende Datenbank wird ueberschrieben."
read -r -p "Zum Fortfahren 'restore' eingeben: " answer
[[ "$answer" == "restore" ]] || { echo "Abgebrochen."; exit 1; }

echo "== Backend stoppen (keine Schreibzugriffe waehrend des Restores) =="
docker compose stop backend

echo "== Datenbank zurueckspielen =="
gunzip -c "$DB_FILE" | docker compose exec -T postgres psql -U memeparty -d memeparty -v ON_ERROR_STOP=1 >/dev/null

if [[ -n "$UPLOADS_FILE" ]]; then
    [[ -f "$UPLOADS_FILE" ]] || { echo "FEHLER: $UPLOADS_FILE fehlt." >&2; exit 1; }
    echo "== Uploads zurueckspielen =="
    TMP_UPLOADS=$(mktemp -d)
    tar xzf "$UPLOADS_FILE" -C "$TMP_UPLOADS"
    docker compose cp "$TMP_UPLOADS/." backend:/app/data/uploads >/dev/null
    rm -rf "$TMP_UPLOADS"
fi

echo "== Backend starten =="
docker compose start backend
docker compose up -d --wait --wait-timeout 120
echo "Fertig. Bitte im Browser pruefen und MemeParty einmal neu laden."
