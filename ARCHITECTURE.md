# Architektur des ersten Meilensteins

## Verantwortlichkeiten

- `apps/web`: React-Ansichten, Editor, persönliche Sprache, visuelle Timer.
- `apps/server`: Session-/Origin-Prüfung, Zod-Validierung, Socket-Transport, Redis-Dienste.
- `packages/shared`: einmalig definierte Eventtypen, Payloadschemas, Datenmodelle.
- `packages/game-engine`: Phasen, Berechtigungen, Teilnahmen und Round-Loop.
- `packages/game-modes`: Rundenregeln, Vorlagenverteilung, Voting-/Scoring-Strategien.

Die Engine erhält ihre Modusregistrierung per Dependency Injection und importiert
keine konkrete Meme-Implementierung zur Laufzeit. Die Engine rendert keine Bilder. Caption-Layer liegen als JSON vor und werden in
React angezeigt. Die aktuelle Input-Payload ist auf Textlayer beschränkt; die
allgemeine GameMode-API für Zeichen-, GIF- und Antwortspiele ist noch auszubauen.
Insbesondere ist diese Version keine Behauptung, dass solche Modi bereits ohne
Schemaänderungen einsteckbar sind.

## Phasen

LOBBY → PREPARING → ROUND_INTRO → INPUT → INPUT_LOCKED → PRESENTATION →
VOTING → ROUND_RESULTS → NEXT_ROUND oder GAME_RESULTS → FINISHED.

`Engine.start`, `Engine.update`, `Engine.action`, `Engine.finish`, `join`,
`disconnect` und die Reconnect-Behandlung bilden den Lifecycle. Separate
Phase-Plugins mit jeweils allen sieben Hooks sind ein späterer Ausbau.
Ein Tick jede Sekunde verarbeitet ausschließlich fällige Phasen oder Host-Migrationen.
Das ist ein serverinterner Scheduler, kein Client-Polling. Fristen werden auch
bei jeder Aktion geprüft, sodass eine verzögerte Scheduler-Ausführung keine
verspäteten Einsendungen oder Stimmen erlaubt.

## Redis und horizontale Ausführung

Jede Lobby liegt unter `lobby:CODE` als JSON mit Revision und 24-Stunden-TTL.
Jede Mutation benötigt einen 5-Sekunden-Lock. Eine Lua-Operation prüft den
Lock-Token vor dem Commit und speichert State und Domain-Events atomar.
Eine abgelaufene Lock-Lease kann keinen neueren Commit überschreiben.
Der Callback verändert nur ein lokales Objekt und wartet auf keine externen APIs.
Redis Pub/Sub informiert alle Instanzen; jede erstellt pro lokalem Socket eine
persönliche Projektion. Socket.IO verwendet zusätzlich den Redis Adapter.

JSON-Snapshots werden pro Änderung anstelle feingranularer Deltas übertragen;
Assets laufen über HTTP. Payloadgrößen und Spieleranzahl sind begrenzt. Deltas
und eine effizientere Due-Time-Queue sind vor sehr großen Lasten auszubauen.

## Reconnect und Host

Ein zufälliger 256-bit-Cookie dient als Session-Token. Nur der SHA-256-Hash wird
als Redis-Key verwendet. Der Cookie ist HttpOnly, SameSite=Lax und in Produktion
Secure. Player-ID, Nickname und Lobbyzuordnung stammen ausschließlich aus dieser
Session. Ein Client kann keine andere Player-ID über seine Payload wählen.

Serverseitige Entwürfe speichern nach 700 ms Ruhe; weniger als 700 ms vor einem
Reload getippter Text kann noch nicht gespeichert sein. Votes, Buddy und Scores
liegen mit der Lobby in Redis. Der neue Socket liest die vollständige persönliche
Projektion. Mehrere Tabs derselben Session zählen als ein Spieler.

Host-Migration erfolgt nach 15 Sekunden Abwesenheit. Ein zurückkehrender ehemaliger
Host bekommt seine Rechte nicht zurück. Tabs werden über Redis-Zeitstempel erfasst.
Abgelaufene Socket-Heartbeats werden serverseitig ausgewertet, auch bei einem harten Prozessabbruch.

## Geheimhaltung

Während INPUT werden fremde Eingaben nicht gesendet. Während anonymer Bewertung
fehlen Author-ID, Punkte und fremde Votes vollständig. Das eigene Meme trägt ein
`own`-Flag, damit gleiche Caption-Inhalte nicht zu falscher Zuordnung führen.
Mitglieder-/Nicknamelisten sind weiterhin sichtbar. Autoren werden bei Ergebnissen
aufgelöst. Alle Host-Aktionen prüfen serverseitige Mitgliedschaft und Host-ID.

## Dauerhafte Daten und Domain-Events

Die Commit-Operation legt Events in einen Redis Stream. Ein Consumer-Group-Worker
speichert sie asynchron per idempotentem Prisma-Upsert in PostgreSQL. Abgestürzte
Consumer werden über XAUTOCLAIM zurückgewonnen. Nach Commit und Ack wird der
Stream-Eintrag gelöscht. Bei PostgreSQL-Ausfall bleibt er pending. Der Loop läuft
weiter, `/ready` signalisiert den Ausfall. Das Produktionssetup startet nur bei
verfügbarer Datenbank.

`GameFinished` enthält Rangliste und Modus. Eine normalisierte Game-History,
Statistikaggregation und Achievement-Consumer sind noch nicht implementiert.
Outbox und Lobby-Commit sind atomar, initiales Lobby-Anlegen und Session-Bind
sind dagegen noch separate Operationen.

## Sicherheit

Zod für HTTP-/Socket-Eingaben. Redis-Ratelimits für Aktionen, Chat und Lobbyanlage;
Fastify-Limit für HTTP. Origin-Prüfung für state-changing HTTP und Socket-Handshake.
Kein ungefiltertes HTML; Captions/Chat laufen durch React-Textescaping. Layerfarben
werden als Hex validiert. Production-Cookie erfordert HTTPS. Logs redigieren Cookie
und Authorization. Konfiguration über Environment Variables.

Private Codes sind Einladungen, keine Verwaltungsrechte. Diese Version hat weder
Account- noch Administrator-Authentifizierung. Uploads sind nicht angeboten, darum
existiert auch keine öffentlich unvalidierte Uploadroute. Family-Filter ist noch kein
vollwertiger Moderationsfilter; siehe STATUS. Reverse Proxy muss auf denselben Origin
zeigen, nicht auf eine beliebige CORS-Origin. Alle Backend-Uhren müssen synchron sein.

## Lokaler Testbetrieb

`docker-compose.local.yml` ist bewusst separat von der HTTPS-Produktionskonfiguration.
Der lokale Browser verwendet http://localhost:PORT; nur in diesem Setup sind
Session-Cookies fuer HTTP geeignet. Datenbank/Redis sind nicht nach aussen freigegeben.
Die Windows-/Bash-Starter erzeugen `.env.local` und ein zufaelliges Passwort.

`game:action` mit `restart` ist hostautorisiert und nur nach dem Endergebnis zulaessig.
Die Lobby/Spieler bleiben, Spiel-ID, Scores, Ready und Runde werden zurueckgesetzt.
Disconnect-Schreibzugriffe werden bei kurzfristigem Lockkonflikt wiederholt; ein
altes Disconnect darf keine neuere Verbindung als offline markieren.
