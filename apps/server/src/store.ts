import { modes } from "@memeparty/game-modes";
import Redis from "ioredis";
import { randomUUID } from "node:crypto";
import { Engine, type DomainEvent } from "@memeparty/game-engine";
import { type Lobby } from "@memeparty/shared";
export const redis = new Redis(
  process.env.REDIS_URL ?? "redis://localhost:6379",
);
export const publisher = redis.duplicate();
const ttl = 86400;
export async function saveNew(l: Lobby) {
  const key = `lobby:${l.code}`;
  if (!(await redis.set(key, JSON.stringify(l), "EX", ttl, "NX")))
    throw Error("CODE_COLLISION");
  await redis.sadd("lobbies", l.code);
}
export async function load(code: string): Promise<Lobby | null> {
  const raw = await redis.get(`lobby:${code}`);
  return raw ? (JSON.parse(raw) as Lobby) : null;
}
export async function mutate(code: string, fn: (e: Engine) => void) {
  const token = randomUUID();
  const lock = `lock:${code}`;
  if (!(await redis.set(lock, token, "PX", 5000, "NX"))) throw Error("BUSY");
  try {
    const l = await load(code);
    if (!l) throw Error("NOT_FOUND");
    const events: DomainEvent[] = [];
    const engine = new Engine(l, modes, (e) => events.push(e));
    fn(engine);
    l.revision++;
    const result = await redis.eval(
      `if redis.call('GET',KEYS[1]) ~= ARGV[1] then return 0 end redis.call('SET',KEYS[2],ARGV[2],'EX',86400) for i=3,#ARGV do redis.call('XADD',KEYS[3],'*','event',ARGV[i]) end redis.call('PUBLISH','lobby-updates',KEYS[2]) return 1`,
      3,
      lock,
      `lobby:${code}`,
      "domain-events",
      token,
      JSON.stringify(l),
      ...events.map((e) => JSON.stringify(e)),
    );
    if (result !== 1) throw Error("BUSY");
    return l;
  } finally {
    await redis.eval(
      "if redis.call('GET',KEYS[1])==ARGV[1] then return redis.call('DEL',KEYS[1]) end return 0",
      1,
      lock,
      token,
    );
  }
}
export async function limit(key: string, max: number, seconds: number) {
  const n = await redis.eval(
    "local n=redis.call('INCR',KEYS[1]);if n==1 then redis.call('EXPIRE',KEYS[1],ARGV[1]) end;return n",
    1,
    `limit:${key}`,
    seconds,
  );
  if (Number(n) > max) throw Error("RATE_LIMIT");
}

export async function mutateWithRetry(code: string, fn: (e: Engine) => void) {
  for (let attempt = 0; attempt < 6; attempt++) {
    try {
      return await mutate(code, fn);
    } catch (err) {
      if (!(err instanceof Error) || err.message !== "BUSY" || attempt === 5)
        throw err;
      await new Promise((resolve) => setTimeout(resolve, 25 * (attempt + 1)));
    }
  }
  throw Error("BUSY");
}
