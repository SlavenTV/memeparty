# MemeParty auf einem eigenen Server (VPS) betreiben

Diese Variante laeuft auf einem Root-Server oder VPS mit Docker. Caddy holt und
erneuert das TLS-Zertifikat automatisch, die Anwendung selbst ist danach unter
`https://<deine-domain>` erreichbar.

Getestet wurde der Stack lokal mit Caddy und interner Zertifizierungsstelle
(`deploy/Caddyfile.local-test`, siehe Abschnitt *Vorab lokal pruefen*).
Der eigentliche Let's-Encrypt-Bezug braucht eine echte Domain und offene Ports.

## 1. Voraussetzungen

- VPS mit Ubuntu 22.04/24.04 (oder vergleichbar), **2 GB RAM**, 2 vCPU, 20 GB Disk
- Root-Zugang per SSH
- Eine (Sub-)Domain, deren **A-Record** auf die Server-IP zeigt (auch `AAAA`, wenn IPv6)
- Offene Ports **22, 80, 443** (80 wird fuer die Zertifikatspruefung gebraucht)

## 2. Docker installieren

```bash
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker "$USER"   # danach neu einloggen
docker compose version
```

## 3. Projekt holen und konfigurieren

```bash
sudo mkdir -p /srv && sudo chown "$USER" /srv
git clone https://github.com/SlavenTV/memeparty.git /srv/memeparty
cd /srv/memeparty

cp .env.production.example .env
openssl rand -hex 32          # Ausgabe als POSTGRES_PASSWORD eintragen
nano .env
```

In `.env` muessen stehen:

| Variable | Wert |
|---|---|
| `DOMAIN` | `memeparty.deine-domain.de` (ohne `https://`) |
| `ACME_EMAIL` | deine Mailadresse fuer Let's Encrypt |
| `PUBLIC_ORIGIN` | `https://memeparty.deine-domain.de` — **exakt**, ohne Slash |
| `POSTGRES_PASSWORD` | Ergebnis von `openssl rand -hex 32` |
| `ADMIN_EMAILS` | deine Admin-Adresse(n), kommasepariert |

`chmod 600 .env` — die Datei enthaelt das Datenbankpasswort.

## 4. Starten

```bash
./deploy/deploy.sh
```

Falls die Dateien per ZIP statt `git clone` kamen und kein Ausfuehrungsrecht haben:
`chmod +x deploy/*.sh`.

Das Skript prueft die Pflichtwerte, baut die Images, startet alle Dienste, wartet
auf die Healthchecks und ruft `https://<DOMAIN>/ready` ab. Erst wenn das antwortet,
ist MemeParty online. Der erste Start dauert wegen des Zertifikats und des Builds
typischerweise 2–5 Minuten.

Kontrolle:

```bash
docker compose ps
docker compose logs -f --tail 100 caddy
curl -sS https://<DOMAIN>/ready
```

## 5. Backups

```bash
./deploy/backup.sh
```

Sichert PostgreSQL-Dump, Redis-Snapshot und Uploads nach `backups/` und loescht
Dateien, die aelter als 14 Tage sind (`RETENTION_DAYS` aendert das). Als Cronjob:

```bash
crontab -e
# taeglich 03:15
15 3 * * * cd /srv/memeparty && ./deploy/backup.sh >> /var/log/memeparty-backup.log 2>&1
```

Wichtig: `backups/` liegt auf derselben Platte wie die Daten. Bitte zusaetzlich
offsite kopieren (z. B. `rclone sync backups/ remote:memeparty-backups`).

Wiederherstellen:

```bash
./deploy/restore.sh backups/db-20261115-031500.sql.gz backups/uploads-20261115-031500.tar.gz
```

## 6. Updates

**Variante A — Server baut selbst:**

```bash
cd /srv/memeparty && ./deploy/deploy.sh --pull
```

**Variante B — Images aus GitHub Actions (GHCR):**

Jeder Push auf `main` und jeder Tag `v*` baut in `.github/workflows/build.yml`
zwei Images (`memeparty-server`, `memeparty-web`). Auf dem Server:

```bash
cd /srv/memeparty
git pull --ff-only
docker compose pull
IMAGE_TAG=<sha-oder-tag> ./deploy/deploy.sh --no-build
```

Pakete sind standardmaessig privat: einmalig `docker login ghcr.io` mit einem
GitHub-Token (`read:packages`).

**Rollback:** `IMAGE_TAG=<alter-sha> ./deploy/deploy.sh --no-build`. Die
Datenbankmigration laeuft beim Backend-Start automatisch und ist vorwaertsgerichtet —
vor Updates deshalb ein Backup ziehen.

## 7. Betrieb

| Aufgabe | Befehl |
|---|---|
| Logs (alle Dienste) | `docker compose logs -f --tail 100` |
| Logs nur Backend | `docker compose logs -f backend` |
| Status | `docker compose ps` |
| Neustart | `docker compose restart backend` |
| Stoppen | `docker compose down` |
| Verbrauch | `docker stats --no-stream` |

Log-Rotation ist im Compose eingebaut (json-file, 10 MB × 3 pro Dienst).
Postgres und Redis sind **nicht** nach aussen veroeffentlicht; erreichbar sind nur
80/443 (Caddy). Alle Anwendungsports bleiben im internen Docker-Netz.

## 8. Haertung (empfohlen)

```bash
# Firewall
ufw allow OpenSSH && ufw allow 80/tcp && ufw allow 443/tcp && ufw enable
# Automatische Sicherheitsupdates
apt install -y unattended-upgrades
```

SSH nur mit Key (`PasswordAuthentication no`), Docker-Dienste laufen als
`restart: unless-stopped` und kommen nach einem Reboot selbst zurueck.

## 9. Vorab lokal pruefen (ohne echte Domain)

Der Produktions-Stack laesst sich mit Caddys interner CA vollstaendig testen:

```bash
DOMAIN=localhost CADDYFILE=./deploy/Caddyfile.local-test \
HTTPS_PORT=8443 HTTP_PORT=8081 PUBLIC_ORIGIN=https://localhost:8443 \
ACME_EMAIL=test@example.com POSTGRES_PASSWORD=testpass123 ADMIN_EMAILS=admin@memeparty.local \
docker compose up -d --build --wait

curl -k https://localhost:8443/ready
# danach
docker compose down -v
```

Im Browser erscheint eine Zertifikatswarnung (interne CA) — fuer den Test in Ordnung.

## 10. Bekannte Grenzen

- Ein Backend-Container. Fuer mehrere Instanzen sind der Socket.IO-Redis-Adapter und
  die Redis-Locks bereits vorhanden, ein horizontaler Lasttest fehlt aber weiterhin.
- Uploads liegen im Volume `uploads_data`; bei mehreren Hosts waere Object-Storage noetig.
- Kein Mailversand (Passwort-Reset/Einladungen per Mail gibt es noch nicht).
- Kein automatischer Neustart bei Zerstoerung des Zertifikatsordners: `caddy_data`
  nicht loeschen, sonst wird ein neues Zertifikat angefordert (Rate Limit bei Let's Encrypt).
