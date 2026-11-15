# Funktionsstand 0.3.1 — direkter Editor und Meme-Pool

## Korrektur in 0.3.1

- nginx-CSP erlaubt die eingebundenen Bilder von https://i.imgflip.com.
  In 0.3 wurden diese irrtuemlich durch img-src blockiert.

## Neu in 0.3

- Text direkt auf dem Bild ziehen und per Doppelklick oder Stift bearbeiten.
- Griffe fuer Groesse/Breite und freie Drehung; keine Positionsregler mehr.
- Textfelder mit Pfeiltasten verschieben, Enter zum Bearbeiten, Escape beendet.
- Pro Spieler und Runde 0–10 Vorlagenwechsel, serverseitig geprueft.
- Texte bleiben bei einem Wechsel erhalten; Limit/Zuordnung ueberstehen Reconnect.
- Sechs kombinierbare Kategorien: Klassiker, Reaktionen, Tiere, Comics/Cartoons,
  Arbeit/Alltag und eigene Illustrationen; mindestens eine Kategorie.
- 18 klassische Internet-Vorlagen von Imgflip plus 3 eigene Illustrationen.
- Bilder behalten ihr urspruengliches Seitenverhaeltnis ohne Zuschnitt.
- Alte gespeicherte Lobbys erhalten die neuen Konfigurations-Defaults.

## Lokaler Test

- Windows-Start/Stop/Status/Logs/Test per Doppelklick mit Docker Desktop.
- Eigenes HTTP-Setup ohne Secure-Cookie-Zwang fuer den lokalen Browser.
- Zufalls-Datenbankpasswort, automatische Migration und Bereitschaftspruefung.
- Vollstaendiger Zwei-Spieler-Integrationstest inklusive Datenbankpersistenz.
- Neustart nach dem Endergebnis in derselben Lobby, mit neuer Spiel-ID und Scores 0.
- Wiederholungsversuche bei konkurrierenden Disconnects und Schutz vor veralteten
  Disconnect-Ereignissen nach einem Reconnect.
- Development-Proxy fuer /health und /ready.

## Implementiert

- Echter Socket.IO-Multiplayer mit privaten Lobbys, Code/Link, Gästen und Ready.
- Servergesteuerter vollständiger Rundenablauf bis zur finalen Rangliste.
- Fünf Modi: unterschiedliche Vorlage, gleiche Vorlage, Thema, Entspannt, Chaos.
- Texteditor mit vier Layern, Position/Breite/Größe/Farbe/Kontur/Drehung/Ausrichtung.
- Serverseitige Entwürfe, Abgabe, Voting, Buddy und Scoring.
- Anonyme serverseitige Projektion, Self-Vote-/Mehrfachvote-/Deadline-Prüfungen.
- Reconnect mit Cookie-Identität und 15-Sekunden-Host-Migration.
- Lobby-Chat mit Ratelimit; Host-Kick plus Sperre der aktuellen Gastidentität.
- Redis-Speicherung, gefencete Schreiblocks, Redis Adapter, asynchrone Domain-Events.
- Prisma-Migration, Docker Compose Development/Production und Plesk-Anleitung.
- Responsive dunkle Oberfläche, Tastatur-/Fokuszustände, Reduced Motion.
- Deutsch/Englisch für die Bedienung; Themen/Vorlagennamen aktuell Deutsch.
- PWA-Manifest, Service Worker, Offline-Seite.

## Noch offen aus dem Gesamtauftrag

1. Vollständig generische GameMode-/Phase-Hook-API und alternative Inputschemata.
2. Meme Duel mit Turnierbaum; Ranking/Sterne/Best-of-N/Duel-/Team-Strategien.
3. Accounts mit Argon2, Email-Verifikation, Freunde, Profile und Presets.
4. Sicherer Sharp-Upload, Template-/Pack-Studio, S3/MinIO, GIF-Verarbeitung.
5. Öffentliche Lobbyliste/Quick Play, Zuschauer und konfigurierbarer Late Join.
6. Reports, Vote Kick, lokale Mutes, effektive Family-/Nickname-/Caption-Filter.
7. Admin Panel, normalisierte Historie, Statistiken und Achievements.
8. Konfigurierbare Host-Timeouts und verteilte Lasttests.
9. Deltas statt Snapshot-Broadcast; Due-Time-Queue statt Lobby-Set-Scan.
10. Serverseitiger Export fertiger Meme-Bilder, Shadow/Font-Auswahl.

Die jetzigen originären Vorlagen sind family-friendly. Der konfigurierte Family-Flag
filtert keine vom Spieler verfassten Texte. Es gibt keine behauptete automatische
Moderation. Der Kick sperrt nur die vorhandene Gastidentität; ein neuer Browser mit
neuem Cookie kann wieder beitreten. Ein privater Lobby-Code ist keine Passwortsperre.

Bei Server-Neustart bleibt State in Redis, Browser reconnecten automatisch. Bei hartem
Instanzabbruch erkennt die Heartbeat-Auswertung abgelaufene Socket-Sessions nach
maximal 60 Sekunden; anschließend gilt der 15-Sekunden-Host-Timeout.

Veröffentlichung dieser Version als öffentlich moderierte Plattform setzt die offenen
Account-/Moderations-/Admin-Funktionen voraus. Das Paket erfüllt den ersten spielbaren
Slice des Auftrags und behauptet nicht, die vollständige Produktionsplattform zu sein.
