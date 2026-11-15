# Pruefung Version 0.3.1 — 02.10.2026

## Bestanden in dieser Version

- TypeScript Strict Typecheck.
- 17 Unit-Tests mit Kategorien, serverseitigen Wechsel-Limits, privaten
  Zuweisungen, Round-Reset, Reconnect und Legacy-Config-Defaults, einschliesslich Neustart mit neuer Spiel-ID und Schutz vor
  verspaeteten Disconnect-Ereignissen nach einem Reconnect.
- Production-Build des Frontends (etwa 109 KB JavaScript gzip).
- Vollstaendiger HTTP-/WebSocket-Integrationstest mit dem echten Backend und
  Redis 7: Gast-Cookies, Origin-Schutz, Lobby, zwei Spieler, Entwurf-Reconnect,
  servergesteuerte Timer, Abgaben, anonyme Projektion, Mehrfachvote-Schutz,
  Scoring, Endergebnis und Neustart derselben Lobby. In 0.3 zusaetzlich:
  Original-Kategorie, privater Vorlagenwechsel, Limit-Ablehnung und Erhalt von
  Vorlage/Restlimit/Entwurf nach Reconnect.
- Prisma-Migration ueber das PostgreSQL-Protokoll erfolgreich angewendet.
- GameFinished wurde von der Redis-Outbox mit dem echten Prisma-Client in die
  Testdatenbank geschrieben und anschliessend mit korrekten Scores gelesen.
- PowerShell-Startskript mit dem PowerShell-Parser geprueft. Erste Einrichtung,
  automatische Ausweich-Portwahl, Wiederverwendung der Konfiguration und
  Browser-URL wurden in einem isolierten Launcher-Test geprueft.
- Bash-Skripte auf Syntax geprueft. Lokale Compose-Datei und Healthchecks geprueft.

## Genaue Grenzen

Die Datenbankpruefung nutzte **PGlite 0.5.8 mit pglite-socket 0.2.11**, eine
PostgreSQL-Engine als WASM mit TCP-Protokoll. Wegen dessen Multiplexer wurden nur
fuer diese Testumgebung Prepared-Statement-Caches deaktiviert. Dies ersetzt keinen
Test eines nativen PostgreSQL-16-Containers. Im ausgelieferten Docker-Setup wird
normaler PostgreSQL 16 verwendet; PGlite ist keine Produktabhaengigkeit.

Docker Desktop und Windows waren hier nicht verfuegbar. Die PowerShell-Pruefung
lief unter PowerShell 7.4.6 auf Linux; Docker- und Browseraufrufe wurden im
Launcher-Test ersetzt. Container-Build/Start unter Windows muessen deshalb auf
deinem Rechner ausgefuehrt werden. **Test-MemeParty.cmd** prueft dort die echten
HTTP-/WebSocket-/Redis-/PostgreSQL-Container.

Die zwei Playwright-Browsertests aus 0.1 wurden an die neue Textstruktur angepasst.
Ein weiterer Playwright-Test prueft direkten Canvas-Text, Drag, Resize, Rotation,
privaten Wechsel, Restlimit und Entwurf nach F5 sowie mobile Breite.
In dieser Umgebung ist aktuell kein Chromium-Binary verfuegbar und der Download
nicht erreichbar: Die Browsertests fuer 0.3 wurden deshalb nicht ausgefuehrt.
Die direkten Maus-/Touch-Gesten und das visuelle Layout muessen lokal geprueft werden.
Ebenso konnten die Internetbilder hier nicht im Browser geladen werden; die
Bild-URLs und Dimensionen wurden gegen den offiziellen Imgflip-API-Katalog geprueft.

Die lokale Konfiguration ist an 127.0.0.1 gebunden. Netzwerk-/Handy-Zugriff im LAN
ist nicht Teil dieses lokalen Starts. Ein verteilter Lasttest und ein vollstaendiger
Accessibility-Audit stehen weiterhin aus.

## Korrektur 0.3.1

Die ausgelieferte nginx-CSP enthielt img-src ausschliesslich fuer self/data und
blockierte damit die neuen Internetbilder. Sie erlaubt jetzt zusaetzlich genau
https://i.imgflip.com. Der Archivinhalt wurde auf die korrigierte Konfiguration
geprueft. Docker/nginx-Browserbetrieb konnte hier weiterhin nicht ausgefuehrt werden.
Keine Aenderungen am Spielcode gegenueber den bestandenen 0.3-Tests.
