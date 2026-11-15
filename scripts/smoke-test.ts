import { randomUUID, createHash } from "node:crypto";
import assert from "node:assert/strict";
import { io, type Socket } from "socket.io-client";
import { PrismaClient } from "@prisma/client";
import Redis from "ioredis";
import {
  configSchema,
  type Action,
  type ClientEvents,
  type ServerEvents,
  type Snapshot,
  type Input,
  type Reply,
} from "@memeparty/shared";

const baseURL = process.env.SMOKE_BASE_URL ?? "http://frontend";
const origin = process.env.PUBLIC_ORIGIN ?? "http://localhost:8080";
const db = new PrismaClient();
const redis = new Redis(process.env.REDIS_URL ?? "redis://localhost:6379");
const clients: TestPlayer[] = [];
let lobbyCode: string | null = null;
const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
async function until<T>(
  read: () => T | Promise<T>,
  valid: (value: T) => boolean,
  timeout = 25000,
) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    const value = await read();
    if (valid(value)) return value;
    await pause(100);
  }
  throw Error("Zeitlimit bei einer Testpruefung ueberschritten.");
}
function check<T>(reply: Reply<T>): T {
  if (!reply.ok) throw Error(`Server: ${reply.error}`);
  return reply.data;
}
class TestPlayer {
  state: Snapshot | null = null;
  socket: Socket<ServerEvents, ClientEvents>;
  constructor(
    public id: string,
    public cookie: string,
  ) {
    this.socket = this.makeSocket();
  }
  private makeSocket() {
    const s = io(baseURL, {
      transports: ["websocket"],
      autoConnect: false,
      reconnection: false,
      extraHeaders: { Origin: origin, Cookie: this.cookie },
    });
    s.on("lobby:state", (state) => {
      this.state = state;
    });
    return s;
  }
  async connect() {
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.socket.disconnect();
        reject(Error("WebSocket-Verbindung nicht bereit."));
      }, 10000);
      this.socket.once("connect", () => {
        clearTimeout(timer);
        resolve();
      });
      this.socket.once("connect_error", (err) => {
        clearTimeout(timer);
        reject(err);
      });
      this.socket.connect();
    });
  }
  async create() {
    return new Promise<{ code: string }>((resolve, reject) =>
      this.socket.timeout(8000).emit(
        "lobby:create",
        {
          name: "Automatischer Lokaltest",
          config: configSchema.parse({
            categories: ["originals"],
            rerolls: 1,
            rounds: 1,
            inputSeconds: 10,
            voteSeconds: 10,
            hostNext: true,
          }),
        },
        (err, reply) => {
          try {
            if (err) throw err;
            resolve(check(reply));
          } catch (e) {
            reject(e);
          }
        },
      ),
    );
  }
  async join(code: string) {
    return new Promise<{ code: string }>((resolve, reject) =>
      this.socket.timeout(8000).emit("lobby:join", { code }, (err, reply) => {
        try {
          if (err) throw err;
          resolve(check(reply));
        } catch (e) {
          reject(e);
        }
      }),
    );
  }
  async restore() {
    return new Promise<{ code: string } | null>((resolve, reject) =>
      this.socket.timeout(8000).emit("lobby:restore", (err, reply) => {
        try {
          if (err) throw err;
          resolve(check(reply));
        } catch (e) {
          reject(e);
        }
      }),
    );
  }
  async action(action: Action) {
    return new Promise<void>((resolve, reject) =>
      this.socket.timeout(8000).emit("game:action", action, (err, reply) => {
        try {
          if (err) throw err;
          check(reply);
          resolve();
        } catch (e) {
          reject(e);
        }
      }),
    );
  }
  async reconnect() {
    this.socket.disconnect();
    await pause(200);
    this.state = null;
    this.socket = this.makeSocket();
    await this.connect();
    return this.restore();
  }
  async phase(phase: Snapshot["phase"], timeout = 25000) {
    return until(
      () => this.state,
      (s) => s?.phase === phase,
      timeout,
    );
  }
}
async function createPlayer(label: string) {
  const nickname = `Test${label}_${randomUUID().slice(0, 8)}`;
  const response = await fetch(`${baseURL}/api/session`, {
    method: "POST",
    headers: { Origin: origin, "Content-Type": "application/json" },
    body: JSON.stringify({ nickname }),
  });
  assert.equal(response.status, 200, "Gastsession fehlgeschlagen");
  const user = (await response.json()) as { id: string };
  const cookieHeader = response.headers
    .getSetCookie()
    .find((value) => value.startsWith("mp_session="));
  assert.ok(cookieHeader);
  assert.match(cookieHeader, /HttpOnly/i);
  assert.match(cookieHeader, /SameSite=Lax/i);
  if (process.env.NODE_ENV !== "production")
    assert.doesNotMatch(cookieHeader, /(?:^|;)\s*Secure(?:;|$)/i);
  const cookie = cookieHeader.split(";")[0];
  assert.ok(cookie, "Session-Cookie fehlt");
  const player = new TestPlayer(user.id, cookie);
  clients.push(player);
  await player.connect();
  return player;
}
const input = (text: string): Input => ({
  layers: [
    {
      text,
      x: 5,
      y: 6,
      width: 90,
      size: 32,
      font: "impact",
      color: "#ffffff",
      outline: 2,
      rotation: 0,
      uppercase: true,
      align: "center",
    },
  ],
});

try {
  const ready = await fetch(`${baseURL}/ready`);
  assert.equal(ready.status, 200, "Redis/PostgreSQL noch nicht bereit");
  assert.equal(((await ready.json()) as { ok: boolean }).ok, true);
  const csrf = await fetch(`${baseURL}/api/session`, {
    method: "POST",
    headers: {
      Origin: "https://wrong-origin.invalid",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ nickname: "OriginTest" }),
  });
  assert.equal(csrf.status, 403);
  console.log("1/6 HTTP, Origin-Schutz, Redis und PostgreSQL erreichbar.");
  const a = await createPlayer("Alpha");
  const b = await createPlayer("Bravo");
  lobbyCode = (await a.create()).code;
  await b.join(lobbyCode);
  await until(
    () => a.state,
    (s) => s?.players.length === 2,
  );
  console.log("2/6 Zwei echte Gast-Sessions und WebSocket-Lobby erstellt.");
  await a.action({ type: "ready", ready: true });
  await b.action({ type: "ready", ready: true });
  await a.action({ type: "start" });
  await a.phase("INPUT");
  await b.phase("INPUT");
  await a.action({ type: "draft", input: input("Reconnect-Pruefung") });
  const initialTemplate = a.state!.templateId;
  const otherTemplate = b.state!.templateId;
  await a.action({ type: "reroll" });
  await until(
    () => a.state,
    (s) => s?.rerollsRemaining === 0,
  );
  assert.notEqual(a.state!.templateId, initialTemplate);
  assert.equal(b.state!.templateId, otherTemplate);
  await assert.rejects(() => a.action({ type: "reroll" }), /REROLL_LIMIT/);
  const chosenTemplate = a.state!.templateId;
  const restored = await a.reconnect();
  assert.equal(restored?.code, lobbyCode);
  await a.phase("INPUT");
  assert.equal(a.state!.templateId, chosenTemplate);
  assert.equal(a.state!.rerollsRemaining, 0);
  assert.equal(a.state?.myInput?.layers[0].text, "Reconnect-Pruefung");
  assert.equal(a.state?.players.find((p) => p.id === a.id)?.id, a.id);
  console.log(
    "3/6 Kategorien, Meme-Wechsel-Limit und Reconnect mit Textentwurf funktionieren.",
  );
  await a.action({ type: "submit", input: input("Alpha") });
  await b.action({ type: "submit", input: input("Bravo") });
  await a.phase("VOTING");
  await b.phase("VOTING");
  const aTarget = a.state!.submissions.find((s) => !s.own)!;
  const bTarget = b.state!.submissions.find((s) => !s.own)!;
  assert.ok(aTarget && bTarget);
  assert.equal(
    aTarget.playerId,
    undefined,
    "Anonyme Autor-ID darf noch nicht vorhanden sein",
  );
  await a.action({ type: "vote", submissionId: aTarget.id, value: 1 });
  await b.action({ type: "vote", submissionId: bTarget.id, value: 1 });
  await assert.rejects(
    () => a.action({ type: "vote", submissionId: aTarget.id, value: 1 }),
    /ALREADY_VOTED/,
  );
  console.log(
    "4/6 Server-Timer, Abgaben, Anonymitaet und Mehrfachvote-Schutz funktionieren.",
  );
  await a.phase("ROUND_RESULTS");
  assert.equal(a.state!.players.find((p) => p.id === a.id)?.score, 100);
  assert.equal(a.state!.players.find((p) => p.id === b.id)?.score, 100);
  await a.action({ type: "next" });
  await a.phase("GAME_RESULTS");
  console.log("5/6 Serverseitige Punkte und finales Spielergebnis stimmen.");
  const raw = await redis.get(`lobby:${lobbyCode}`);
  assert.ok(raw);
  const lobby = JSON.parse(raw) as { gameId: string };
  const persisted = await until(
    () =>
      db.domainEvent.findFirst({
        where: { gameId: lobby.gameId, type: "GameFinished" },
      }),
    (value) => value !== null,
    15000,
  );
  assert.ok(persisted);
  const payload = JSON.parse(persisted.payload) as {
    payload: { players: { id: string; score: number }[] };
  };
  assert.equal(payload.payload.players.find((p) => p.id === a.id)?.score, 100);
  console.log(
    "6/6 GameFinished wurde ueber den Redis-Stream dauerhaft in PostgreSQL gespeichert.",
  );
  await a.action({ type: "restart" });
  await a.phase("LOBBY");
  assert.ok(a.state!.players.every((p) => p.score === 0 && !p.ready));
  console.log("Die Lobby ist fuer das naechste Spiel wieder bereit.");
  console.log("MemeParty: Alle lokalen Integrationstests bestanden.");
} catch (err) {
  console.error(err instanceof Error ? err.message : "Unbekannter Testfehler.");
  process.exitCode = 1;
} finally {
  for (const p of clients) p.socket.disconnect();
  await pause(300);
  if (lobbyCode) {
    await redis.del(`lobby:${lobbyCode}`, `lock:${lobbyCode}`).catch(() => {});
    await redis.srem("lobbies", lobbyCode).catch(() => {});
    await db.domainEvent.deleteMany({ where: { lobbyCode } }).catch(() => {});
  }
  for (const p of clients) {
    const token = p.cookie.slice("mp_session=".length);
    const hash = createHash("sha256").update(token).digest("hex");
    await redis
      .del(
        `session:${hash}`,
        `sockets:${p.id}`,
        `limit:actions:${p.id}`,
        `limit:create:${p.id}`,
      )
      .catch(() => {});
  }
  await redis.quit();
  await db.$disconnect();
}
