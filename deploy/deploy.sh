#!/usr/bin/env bash
# Deploy auf dem Server: bauen, starten, pruefen.
#   ./deploy/deploy.sh          baut lokal und startet
#   ./deploy/deploy.sh --pull   holt vorher neue Commits (git pull --ff-only)
#   ./deploy/deploy.sh --no-build   startet nur (nutzt vorhandene Images)
set -euo pipefail
cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.."

DO_PULL=0
DO_BUILD=1
for arg in "$@"; do
    case "$arg" in
        --pull) DO_PULL=1 ;;
        --no-build) DO_BUILD=0 ;;
        *) echo "Unbekannte Option: $arg" >&2; exit 2 ;;
    esac
done

if [[ ! -f .env ]]; then
    echo "FEHLER: .env fehlt. cp .env.production.example .env und Werte eintragen." >&2
    exit 1
fi
command -v docker >/dev/null || { echo "FEHLER: Docker fehlt." >&2; exit 1; }
docker compose version >/dev/null 2>&1 || { echo "FEHLER: Docker Compose v2 fehlt." >&2; exit 1; }

# Pflichtwerte pruefen, bevor gebaut wird.
set -a
# shellcheck disable=SC1091
source ./.env
set +a
for name in DOMAIN ACME_EMAIL PUBLIC_ORIGIN POSTGRES_PASSWORD ADMIN_EMAILS; do
    if [[ -z "${!name:-}" ]]; then
        echo "FEHLER: $name fehlt in .env" >&2
        exit 1
    fi
done
if [[ "$PUBLIC_ORIGIN" != "https://$DOMAIN" ]]; then
    echo "FEHLER: PUBLIC_ORIGIN ($PUBLIC_ORIGIN) muss https://$DOMAIN sein." >&2
    exit 1
fi
if [[ "$POSTGRES_PASSWORD" == "BITTE_ERSETZEN" ]]; then
    echo "FEHLER: POSTGRES_PASSWORD ist noch der Platzhalter. Erzeuge eins mit: openssl rand -hex 32" >&2
    exit 1
fi

if [[ $DO_PULL -eq 1 ]]; then
    if [[ -d .git ]]; then
        echo "== git pull =="
        git pull --ff-only
    else
        echo "Hinweis: kein Git-Repository, --pull wird ignoriert."
    fi
fi

if [[ $DO_BUILD -eq 1 ]]; then
    echo "== Images bauen =="
    docker compose build
fi

echo "== Starten =="
docker compose up -d --wait --wait-timeout 300

echo "== Bereitschaft pruefen =="
ok=0
for _ in $(seq 1 30); do
    if curl -fsS --max-time 5 "https://$DOMAIN/ready" >/dev/null 2>&1; then ok=1; break; fi
    sleep 2
done
if [[ $ok -ne 1 ]]; then
    echo "FEHLER: https://$DOMAIN/ready antwortet nicht. Letzte Logs:" >&2
    docker compose logs --tail 60 caddy frontend backend >&2
    exit 1
fi

docker compose ps
echo
echo "Online: https://$DOMAIN"
echo "Logs:   docker compose logs -f --tail 100"
echo "Backup: ./deploy/backup.sh"
