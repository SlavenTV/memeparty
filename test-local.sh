#!/usr/bin/env bash
set -euo pipefail
cd -- "$(dirname -- "${BASH_SOURCE[0]}")"
./start-local.sh
docker compose --project-name memeparty-local --env-file .env.local -f docker-compose.local.yml exec -T backend node --import tsx scripts/smoke-test.ts
