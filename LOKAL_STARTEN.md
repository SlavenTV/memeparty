# MemeParty lokal testen (Windows)

## Einmalige Voraussetzung

Docker Desktop installieren und starten. Verwende **Linux-Container** und warte,
bis Docker Desktop betriebsbereit ist. Eine separate Installation von Node.js,
PostgreSQL, Redis, nginx oder npm ist fuer diesen Startweg nicht erforderlich.

## Update auf 0.3.1

1. Im bisherigen Projekt `Stop-MemeParty.cmd` ausfuehren.
2. Das neue ZIP entpacken und die Inhalte des enthaltenen `memeparty`-Ordners
   in den bisherigen Projektordner kopieren; bestehende Projektdateien ersetzen.
3. Die automatisch erzeugte `.env.local` behalten. Sie ist nicht im ZIP enthalten.
4. `Start-MemeParty.cmd` erneut starten. Die geaenderten Images werden gebaut.
5. Im Browser Strg+F5 druecken. Fuer die neuen Regeln eine neue Lobby erstellen
   oder im Lobby-Bildschirm die Regeln anpassen und speichern.

Datenbank und Redis-Volumes bleiben erhalten. Ein Datenbank-Reset ist nicht noetig.

## Bildfehler aus Version 0.3 beheben

Version 0.3 blockierte Imgflip-Bilder ueber die nginx-Content-Security-Policy.
In 0.3.1 ist ausschliesslich die Bildquelle https://i.imgflip.com zusaetzlich erlaubt.
Mit den aktualisierten Projektdateien Stop-MemeParty.cmd und anschliessend
Start-MemeParty.cmd ausfuehren; danach im Browser Strg+F5 druecken.
Die Bilder werden weiterhin aus dem Internet geladen.

## Editor, Kategorien und Vorlagenwechsel

- Text direkt im Bild ziehen; Doppelklick oder Stift oeffnet die Texteingabe.
- ↔ ziehen aendert Groesse und Breite, ↻ ziehen dreht den Text.
- Textfarbe, Ausrichtung, Kontur und Grossbuchstaben unter „Text gestalten“.
- Beim Erstellen oder vor Spielstart beliebig viele Wechsel pro Spieler/Runde festlegen.
- „Meme wechseln“ zieht eine andere Vorlage aus dem ausgewaehlten Kategorien-Pool.
  Text bleibt erhalten; nach Abgabe und nach Ablauf der Eingabezeit kein Wechsel.
- Bei „Same Meme“ starten alle gleich. Erlaubte Wechsel gelten anschliessend einzeln.
  Fuer striktes Same Meme deshalb 0 einstellen.
- Mehrere Kategorien kombinieren. Klassiker aus dem Internet werden von Imgflip
  geladen und benoetigen eine Internetverbindung. Fuer Offline-Bilder nur
  „Eigene Illustrationen“ waehlen.

## Starten

1. ZIP vollstaendig entpacken, beispielsweise nach `C:\Projekte\MemeParty`.
2. Im entpackten `memeparty`-Ordner **Start-MemeParty.cmd** doppelklicken.
3. Beim ersten Start werden die Container heruntergeladen und gebaut. Das kann
   einige Minuten dauern. Die Datenbank wird automatisch angelegt/migriert.
4. Der Browser oeffnet sich automatisch, normalerweise unter
   **http://localhost:8080**. Falls dieser Port belegt ist, waehlt die erste
   Einrichtung einen freien Port bis 8090. Die Adresse steht im Startfenster.

Die Datei `.env.local` und ein zufaelliges Datenbankpasswort werden automatisch
angelegt. Die Entwicklerdatei `.env` und eine Plesk-Domain brauchst du hier nicht.

## Mit zwei Spielern testen

1. Im normalen Browser einen Nickname eingeben und eine Lobby erstellen.
2. Den Lobby-Code kopieren oder den Einladungslink verwenden.
3. Die **gleiche Adresse** in einem Inkognito-Fenster oder einem anderen Browser
   oeffnen. Ein zweiter normaler Tab teilt die Identitaet des ersten Spielers.
4. Zweiten Nickname eingeben, Lobby beitreten und beide Spieler auf Bereit setzen.
5. Der Host startet. Beide erstellen ihre Memes, stimmen ab und sehen Ergebnisse.
6. Nach dem Endergebnis kann der Host mit „Neue Runde mit Freunden“ dieselbe
   Lobby wieder fuer das naechste Spiel vorbereiten.
7. Waehrend der Eingabe F5 druecken, um Reconnect zu testen. Entwuerfe werden
   nach 700 ms Schreibpause gespeichert.

Nutze `localhost`, nicht `127.0.0.1`, fuer den Spielzugriff: Cookie- und
Origin-Pruefung beziehen sich auf die konfigurierte Adresse.

## Admin-Oberflaeche testen

1. Zuerst wie gewohnt einen Nickname eingeben.
2. Oben auf **Admin** klicken und zu „Noch kein Admin-Konto? Jetzt anlegen“ wechseln.
3. `admin@memeparty.local` und ein eigenes Passwort mit mindestens 12 Zeichen verwenden.
4. Danach zeigt **Moderation** offene Vorlagen und Meldungen. Suche, Quellenfilter,
   Freigeben, Ablehnen, Aktivstatus, Altersstufe und NSFW-Markierung lassen sich dort testen.

Die berechtigte lokale Adresse kann bei Bedarf mit `LOCAL_ADMIN_EMAIL` in `.env.local`
geändert werden. Für eine Produktionsumgebung muss `ADMIN_EMAILS` explizit gesetzt werden.

## Weitere Dateien

| Datei | Funktion |
|---|---|
| Start-MemeParty.cmd | Einrichten, bauen, starten und Browser oeffnen |
| Stop-MemeParty.cmd | Stoppen; Daten und Lobbys bleiben in Docker-Volumes |
| Status-MemeParty.cmd | Containerstatus und Adresse anzeigen |
| Logs-MemeParty.cmd | Letzte Meldungen zur Fehlersuche anzeigen |
| Test-MemeParty.cmd | Echten HTTP-/WebSocket-/Redis-/PostgreSQL-Test ausfuehren |

Der Test erzeugt zwei temporaere Testspieler und prueft einen kompletten Spielablauf,
Datenbankpersistenz sowie Reconnect. Er laesst deine eigenen Lobbys unberuehrt und
loescht ausschliesslich seine eigenen Testdaten.

## Typische Probleme

- **Docker Desktop fehlt/ist nicht gestartet:** installieren/starten und erneut doppelklicken.
- **Windows-Container aktiv:** im Docker-Desktop-Menue auf Linux-Container wechseln.
- **Docker kann Images nicht laden:** Internet-/Proxyzugang von Docker Desktop pruefen.
- **Port inzwischen belegt:** MemeParty stoppen und `LOCAL_PORT` in `.env.local`
  auf einen freien Port aendern. Danach neu starten.
- **Kein Beitritt/keine Cookie-Session:** die Adresse genau mit `localhost` oeffnen.
- **PostgreSQL meldet falsches Passwort:** das erzeugte `LOCAL_DB_PASSWORD` nicht
  nachtraeglich aendern; die bestehende Datenbank verwendet das erste Passwort.
- **Der Browser oeffnet nicht automatisch:** die im Startfenster angezeigte Adresse
  manuell oeffnen.

`Stop-MemeParty.cmd` loescht keine Daten. Fuer einen vollstaendigen lokalen Reset
MemeParty stoppen und die Volumes `memeparty-local_local_postgres` sowie
`memeparty-local_local_redis` in Docker Desktop loeschen. Dabei gehen die lokalen
Spiel- und Datenbankdaten verloren; dies geschieht nicht automatisch.

## Linux/macOS

Mit gestartetem Docker und Compose v2:

```bash
chmod +x start-local.sh stop-local.sh test-local.sh
./start-local.sh
./test-local.sh
./stop-local.sh
```

Auf Linux/macOS ist standardmaessig Port 8080 vorgesehen. Einen anderen Port bei
Bedarf in `.env.local` eintragen.

## Umfang

Dieses Paket macht den vorhandenen Multiplayer-Stand lokal start- und testbar.
Der Gesamtauftrag enthaelt weiterhin offene Funktionen, etwa Accounts, eigene
Uploads und ein Adminpanel. Der genaue Stand steht in `STATUS.md`.
