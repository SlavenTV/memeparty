# WebSocket-Protokoll v0.3

Socket.IO, ausschließlich WebSocket-Transport, gleicher Origin. Authentifizierung
über `mp_session`-Cookie vom HTTP-Endpunkt POST `/api/session`.
Schemas und zentrale Typen: `packages/shared/src/index.ts`.

Ack: `{ok:true,data:...}` oder `{ok:false,error:"CODE"}`. Aktionen liefern bei Erfolg
kein `data`-Feld im JSON. Jeder Payload ist serverseitig mit Zod validiert.

| Event | Richtung | Payload | Antwort | Recht | Fehler |
|---|---|---|---|---|---|
| lobby:create | Client → Server | `{name, config}` | `{code}` | Gastsession, keine aktive andere Lobby | ALREADY_IN_LOBBY, RATE_LIMIT, INVALID_REQUEST |
| lobby:join | Client → Server | `{code}` | `{code}` | Gastsession, Platz und Lobbyphase | NOT_FOUND, LOBBY_FULL, GAME_STARTED, BANNED |
| lobby:restore | Client → Server | kein Payload | `{code}` oder null | Gastsession mit eigener Zuordnung | BUSY, RATE_LIMIT |
| game:action | Client → Server | siehe unten | leer | Lobby-Mitglied | BUSY, RATE_LIMIT, NOT_FOUND, INVALID_REQUEST |
| lobby:state | Server → Client | Snapshot | kein Ack | individuelle Projektion | – |
| lobby:kicked | Server → Client | kein Payload | kein Ack | betroffener Spieler | – |

## game:action

| type | Weitere Felder | Berechtigung / Phase | Fehler |
|---|---|---|---|
| ready | ready: boolean | Mitglied / LOBBY | WRONG_PHASE |
| config | config: Config | Host / LOBBY | HOST_ONLY, LOBBY_FULL, WRONG_PHASE |
| start | – | Host / LOBBY, alle verbunden/bereit, mindestens 2 | HOST_ONLY, NOT_READY, WRONG_PHASE |
| next | – | Host / ROUND_RESULTS | HOST_ONLY, WRONG_PHASE |
| restart | – | Host / GAME_RESULTS oder FINISHED, neue Spiel-ID, Scores/Ready zuruecksetzen | HOST_ONLY, WRONG_PHASE |
| reroll | – | Mitglied / INPUT vor Abgabe; eigene Zuordnung aus Kategorienpool wechseln | REROLL_LIMIT, NO_ALTERNATIVE, WRONG_PHASE, ALREADY_SUBMITTED |
| draft | input: Input | Mitglied / INPUT | WRONG_PHASE, ALREADY_SUBMITTED |
| submit | input: Input | Mitglied / INPUT, eine Abgabe | EMPTY_INPUT, TEXT_TOO_LONG, ALREADY_SUBMITTED, WRONG_PHASE |
| vote | submissionId: UUID, value: -1/0/1 | Mitglied / VOTING, fremde Abgabe | SELF_VOTE, ALREADY_VOTED, INVALID_VOTE, NOT_FOUND, WRONG_PHASE |
| buddy | submissionId: UUID | Mitglied / VOTING, ein fremdes Meme | INVALID_BUDDY, ALREADY_BUDDY, WRONG_PHASE |
| chat | text: 1–300 Zeichen | Mitglied / beliebige Phase | RATE_LIMIT |
| kick | playerId: UUID | Host / beliebige Phase, nicht selbst | HOST_ONLY, INVALID_TARGET |

`Config`: mode, rounds (1–10), inputSeconds (10–300), voteSeconds (10–120),
rerolls (0–10 pro Spieler/Runde), categories (1–6 Kategorie-Tags),
maxPlayers (2–12), anonymous, public, family, hostNext. public/family sind für
spätere Meilensteine reserviert und werden aktuell nicht in der UI angeboten.
`Input`: 1–4 Layer mit text, x/y, width, size, color, outline, rotation, uppercase,
align. Koordinaten und Breite sind Prozentwerte. Outline liegt in Pixeln.

`Snapshot`: code/name/hostId/config/players, phase, phaseStart/phaseEnd,
serverTimestamp/revision, roundNumber, topic/rule, eigene templateId,
myInput/submitted, rerollsRemaining (nur eigenes Limit), submissions, myVotes/myBuddy und Chat. Autor und Punkte von
fremden Abgaben sind bis zur Freigabe serverseitig ausgeblendet. Kein Snapshot
enthält Cookie, Session-Hash oder fremde Entwürfe.

## HTTP

- POST `/api/session`: `{nickname}` → `{id,nickname}` und HttpOnly-Cookie.
  Eine vorhandene gültige Session bleibt erhalten.
- GET `/api/session`: eigene Identität, sonst 401.
- GET `/health`: Prozesszustand.
- GET `/ready`: 200 bei erreichbarem Redis/PostgreSQL, sonst 503.

Disconnect und Reconnect sind Socket.IO-Lifecycle-Ereignisse. Beim Connect ruft
Client `lobby:restore` auf; damit kommt automatisch der aktuelle Snapshot.
