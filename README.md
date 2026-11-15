# MemeParty — Version 0.3.1 (direkter Editor & Meme-Kategorien)

Eigenständiges Multiplayer-Partyspiel, mit React/TypeScript/Vite/Tailwind/Zustand,
Fastify/Socket.IO, Redis und Prisma/PostgreSQL. Dieses Paket ist der erste spielbare
Meilenstein des beigefügten Entwicklungsauftrags. Es ist **nicht die fertige gesamte
Plattform**. Den tatsächlichen Funktionsumfang und die offenen Meilensteine beschreibt
`STATUS.md`.

## Einfachster lokaler Start unter Windows

**`MemeParty.vbs` doppelklicken** — mehr ist nicht noetig. Statt einer Konsole
erscheint ein kleines Fortschrittsfenster: Docker Desktop wird bei Bedarf selbst
gestartet, das Datenbankpasswort automatisch erzeugt, alles gebaut und gestartet,
danach oeffnet sich der Browser auf der lokalen Adresse. Laeuft MemeParty bereits,
oeffnet derselbe Doppelklick nur den Browser.

`MemeParty-Stoppen.vbs` beendet die Container (Daten bleiben erhalten),
`MemeParty-Diagnose.cmd` bietet ein Klartextmenue mit Status, Logs, Selbsttest
(HTTP, WebSockets, Redis, PostgreSQL) und komplettem Neubau.
Eine separate Node.js-Installation ist nicht erforderlich. Details: `LOKAL_STARTEN.md`.

## Spielen

Nickname eingeben, Lobby erstellen, Einladungslink oder sechsstelligen Code teilen.
Alle Spieler setzen „Bereit“, der Host startet. Captions werden als Textlayer gespeichert,
die servergesteuerten Phasen wechseln automatisch. Jeder darf fremde Memes einmal bewerten.
Nach der letzten Runde erscheint die Rangliste. Im Modus „Entspannt“ gibt es keine Punkte
und keinen Sieger. Einladungen funktionieren über `/join/CODE`.

F5 stellt Lobby, Spieler, Entwurf, Abgabe, Votes und Buddy wieder her. Der Session-Cookie
bleibt sieben Tage gültig; Lobbydaten laufen nach 24 Stunden ohne Schreibzugriff ab.
Getrennte Spieler benötigen getrennte Browserprofile/Inkognito-Fenster, nicht nur zwei Tabs.

## Lokale Entwicklung

Voraussetzungen: Node.js 22.12 oder neuer, npm, Docker Compose.

```bash
cp .env.example .env
docker compose -f docker-compose.dev.yml up -d
npm ci
npm run db:generate
npm run db:migrate
node --env-file=.env node_modules/concurrently/dist/bin/concurrently.js "npm run dev -w @memeparty/server" "npm run dev -w @memeparty/web"
```

Öffne http://localhost:5173. Vite leitet `/api` und `/socket.io` an Port 3001 weiter.
Die API erwartet `Origin: http://localhost:5173`. Ohne eigene Umgebungsvariablen
benötigt das Backend mindestens `DATABASE_URL`; die übrigen Development-Werte haben Defaults.

## Prüfung

```bash
npm run typecheck
npm test
npm run build
npx playwright install chromium
node --env-file=.env node_modules/@playwright/test/cli.js test
```

E2E benötigt laufende Redis- und PostgreSQL-Dienste. Der Test nutzt zwei unabhängige
Browser-Sessions, spielt zwei Runden und lädt während der Eingabe neu.
Unit-Tests benötigen keine Datenbank. `VALIDATION.md` dokumentiert, welche Prüfungen
bei Erstellung tatsächlich durchgeführt wurden.

## Administration und Moderation

Nach dem Eingeben eines Nicknames erscheint oben **Admin**. Lokal ist
`admin@memeparty.local` als Admin-Adresse vorbereitet: Im Admin-Dialog auf
„Noch kein Admin-Konto? Jetzt anlegen“ wechseln und ein eigenes Passwort mit mindestens
12 Zeichen festlegen. Danach können Vorlagen gesucht, nach Quelle und Prüfstatus gefiltert,
freigegeben, abgelehnt, deaktiviert sowie als NSFW oder nach Altersstufe eingestuft werden.
Offene Meldungen werden direkt an der jeweiligen Vorlage angezeigt und mit einer
Moderationsentscheidung erledigt. Für andere Umgebungen werden berechtigte Adressen
kommasepariert über `ADMIN_EMAILS` konfiguriert.

## Produktion (eigener Server)

Der Produktions-Stack steht in `docker-compose.yml` und ist für einen VPS/Root-Server
gedacht: Caddy terminiert TLS inklusive automatischer Let's-Encrypt-Zertifikate,
dahinter liegen Frontend-nginx, Backend, PostgreSQL und Redis. Nur 80/443 sind
veröffentlicht, Datenbank und Redis bleiben im internen Docker-Netz.

```bash
cp .env.production.example .env     # DOMAIN, ACME_EMAIL, PUBLIC_ORIGIN, POSTGRES_PASSWORD, ADMIN_EMAILS
./deploy/deploy.sh                 # baut, startet, wartet auf Healthchecks, prüft /ready
./deploy/backup.sh                 # DB-Dump + Redis-Snapshot + Uploads nach backups/
```

`PUBLIC_ORIGIN` muss exakt `https://<DOMAIN>` sein (ohne Slash), sonst schlagen
Origin-Prüfung und WebSockets fehl. Log-Rotation, Healthchecks und `restart:
unless-stopped` sind im Compose konfiguriert.

Komplette Anleitung inklusive DNS, Firewall, Backups, Updates, Rollback und
Fehlersuche: **`deploy/SERVER.md`**. Für Plesk-Hosting mit vorgeschaltetem Proxy
statt Caddy: `deploy/PLESK.md`.

Backend führt die versionierte Prisma-Migration vor dem Start aus. Production-Cookies
sind Secure und funktionieren deshalb nur über HTTPS.

Für mehrere Backend-Instanzen ist bereits der Socket.IO Redis Adapter eingebaut.
Die WebSocket-Verbindung muss an ihrer gewählten Instanz bleiben. Alle Zustandsänderungen
und Timer sind mit Redis-Locks geschützt. Ein horizontaler Lasttest wurde noch nicht
abgeschlossen. Redis AOF sichert Zustände; Backups der Docker-Volumes bleiben nötig.

## Vorlagen

Der aktuelle Katalog umfasst 2.462 eindeutige Vorlagen aus mehreren dokumentierten
Quellen und wird beim Serverstart in PostgreSQL synchronisiert. Suche, Kategorien,
Moderationsstatus und Meldungen kommen dynamisch aus der Datenbank; der Browser lädt nur
die gerade benötigten Einträge. Externe Bilder benötigen eine Internetverbindung.
`ASSETS.md` beschreibt Herkunft und Lizenzhinweise. Eigene Uploads werden zunächst
inaktiv und ungeprüft gespeichert, bis ein Administrator sie freigibt.
