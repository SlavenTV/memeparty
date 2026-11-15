#!/usr/bin/env bash
set -euo pipefail
cd -- "$(dirname -- "${BASH_SOURCE[0]}")"
command -v docker >/dev/null || { echo 'Docker mit Compose v2 installieren und starten.'; exit 1; }
docker info >/dev/null
docker compose version >/dev/null
if [[ ! -f .env.local ]]; then
  command -v openssl >/dev/null || { echo 'openssl fehlt fuer die Passworterzeugung.'; exit 1; }
  printf 'LOCAL_PORT=8080\nLOCAL_DB_PASSWORD=%s\n' "$(openssl rand -hex 32)" > .env.local
  chmod 600 .env.local
fi
docker compose --project-name memeparty-local --env-file .env.local -f docker-compose.local.yml up -d --build --wait --wait-timeout 240
port=$(sed -n 's/^LOCAL_PORT=//p' .env.local | head -n 1 | tr -d '\r')
printf 'MemeParty: http://localhost:%s\nZweiten Spieler in einem anderen Browser/privaten Fenster oeffnen.\n' "$port"
