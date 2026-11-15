# Eigene Startvorlagen

Die drei enthaltenen WebP-Dateien wurden für dieses Projekt mit dem Imagegen-Skill
und dem integrierten Bildgenerator erzeugt, anschließend mit Sharp für das Web
optimiert. Diese drei Illustrationen sind lokal enthalten.

Gemeinsame Vorgaben: originales quadratisches Meme-Motiv, stilisierte filmische
3D-Illustration, humorvolle Mimik, violettes und warmes Licht, freie dunkle Flächen
oben und unten für Captions, keine Texte, Marken oder bekannten Meme-Figuren.

- `apps/web/public/templates/deadline.webp`: nervöse orange Bürokatze vor einem
  Laptop und einem großen Stapel Papier.
- `apps/web/public/templates/plan.webp`: selbstsicherer Waschbär-Erfinder hält
  ein misslungenes kleines Gerät in einer chaotischen Werkstatt.
- `apps/web/public/templates/weekend.webp`: entspannter Frosch im Gamingstuhl
  mit Snacks und großen Kopfhörern.

Das Icon ist ein eigenes geometrisches M-Zeichen als SVG und PNG.
Die Bildherkunft ist keine externe Quellen- oder Markenlizenzbehauptung.

## Klassische Internet-Vorlagen

70 ausgewaehlte Vorlagen stammen aus dem aktuellen Imgflip-Katalog:
https://api.imgflip.com/get_memes (abgerufen am 03.10.2026).
Die offizielle Dokumentation steht unter https://imgflip.com/api.
Namen, Bild-URLs, IDs und Seitenverhaeltnisse sind im gemeinsamen Template-Katalog
`packages/shared/src/index.ts` hinterlegt; Kategorien wurden fuer MemeParty manuell
zugeordnet. Die Kategorien sind Mehrfach-Tags, der Pool bildet ihre Vereinigung.
Der Browser laedt die Originalbilder direkt von i.imgflip.com. Sie sind keine
KI-generierten Kopien und sind nicht als Bilddateien im ZIP enthalten.
Daher brauchen diese Vorlagen Internet und werden nicht durch den Offline-Modus
zwischengespeichert. Bei Ladefehlern erscheint ein sichtbarer Hinweis.
Jede externe Vorlage im Editor verlinkt ihre Imgflip-Quellseite.
Es wird keine eigene Lizenz oder Rechteinhaberschaft an diesen Motiven behauptet.
Fuer einen Betrieb ohne externe Verbindung nur „Eigene Illustrationen“ waehlen.

## Freier Katalog (gesamter öffentlicher Katalog)

Zusätzlich zu den kuratierten Klassikern nutzt MemeParty den öffentlich erreichbaren
Katalog von [JustMeme](https://justmeme.wtf/api-docs). Die dort dokumentierte,
kostenlose API stellt über 2.300 Vorlagen mit Kategorien und ohne API-Key bereit.
Für MemeParty wird der vollständige, zum Importzeitpunkt verfügbare Katalog
übernommen. Bereits vorhandene, kuratierte Imgflip-Bilder werden per Bild-URL
ausgeschlossen, damit die Auswahl nicht dieselbe Vorlage doppelt enthält. Zusammen
mit den 70 kuratierten Imgflip-Vorlagen und drei eigenen Illustrationen stehen
aktuell 2.052 Vorlagen aus diesem Bestand zur Auswahl.

Der wiederholbare Import liegt in `scripts/import-free-meme-templates.ts`; er
speichert ausschließlich Namen, Kategorien, Quellseiten und direkte externe
Bild-URLs in `packages/shared/src/freeTemplates.ts`. Die Bilder werden nicht
heruntergeladen oder als eigene Inhalte ausgegeben. Kategorien aus der Quelle
werden auf die MemeParty-Auswahl (Klassiker, Reaktionen, Tiere, Comics, Arbeit)
abgebildet; ungetaggte Formate landen bei „Klassiker“.

## Memegenscript-Erweiterung

Der öffentliche, MIT-lizenzierte Quellkatalog von
[Memegenscript](https://github.com/terryds/memegenscript) wird mit
`scripts/import-memegenscript-templates.ts` abgeglichen. Nach dem Vergleich von
IDs und normalisierten Namen kamen 410 zusätzliche Vorlagen hinzu. Die Bilder
bleiben extern auf `raw.githubusercontent.com`; MemeParty speichert keine Kopien.
Die Bildmotive selbst gehören weiterhin ihren jeweiligen Rechteinhabern.

Damit umfasst der aktuelle Katalog 2.462 eindeutige Vorlagen. Beim Serverstart
werden die Metadaten in PostgreSQL übernommen. Der Browser lädt anschließend nur
Suchergebnisse und tatsächlich im Spiel verwendete Vorlagen über die API. Externe
Einträge besitzen einen Anbieter, eine Quellseite, Kategorien, Alterskennzeichnung,
Aktivstatus und Moderationsstatus. Nutzer können Vorlagen melden; Administratoren
können sie freigeben, sperren oder neu kategorisieren.
