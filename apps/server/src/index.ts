import { modes } from "@memeparty/game-modes";
import Fastify from "fastify";
import cookie from "@fastify/cookie";
import rateLimit from "@fastify/rate-limit";
import multipart from "@fastify/multipart";
import { Server } from "socket.io";
import { createAdapter } from "@socket.io/redis-adapter";
import { randomBytes, randomUUID, createHash } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { createReadStream } from "node:fs";
import { join } from "node:path";
import argon2 from "argon2";
import sharp, { type Metadata } from "sharp";
import { z } from "zod";
import {
  configSchema,
  categoryIds,
  nicknameSchema,
  actionSchema,
  type Config,
  type ClientEvents,
  type ServerEvents,
  type Reply,
} from "@memeparty/shared";
import { createLobby, Engine } from "@memeparty/game-engine";
import {
  redis,
  publisher,
  load,
  mutate,
  mutateWithRetry,
  saveNew,
  limit,
} from "./store";
import { db, consumeEvents } from "./events";
import {
  catalogueWhere,
  publicTemplate,
  publicTemplateSelect,
  syncTemplateCatalog,
  templatePool,
} from "./catalog";
const origin = process.env.PUBLIC_ORIGIN ?? "http://localhost:5173";
const adminEmails = new Set(
  (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean),
);
const app = Fastify({
  logger: {
    redact: [
      "req.headers.cookie",
      "req.headers.authorization",
      'res.headers["set-cookie"]',
    ],
  },
  trustProxy: process.env.TRUST_PROXY === "true",
});
await app.register(cookie);
await app.register(rateLimit, { max: 100, timeWindow: "1 minute", redis });
await app.register(multipart, {
  limits: { fileSize: 10 * 1024 * 1024, files: 1, fields: 8 },
});
const hash = (s: string) => createHash("sha256").update(s).digest("hex");
interface Session {
  id: string;
  nickname: string;
  code: string | null;
  userId: string | null;
}
async function session(token: string | undefined): Promise<Session | null> {
  if (!token) return null;
  const raw = await redis.get(`session:${hash(token)}`);
  return raw ? (JSON.parse(raw) as Session) : null;
}
app.addHook("onRequest", async (req, res) => {
  if (
    !["GET", "HEAD", "OPTIONS"].includes(req.method) &&
    req.headers.origin !== origin
  )
    return res.code(403).send({ error: "INVALID_ORIGIN" });
});
app.get("/health", async () => ({ ok: true }));
app.get("/ready", async (_, res) => {
  try {
    await redis.ping();
    await db.$queryRaw`SELECT 1`;
    return { ok: true };
  } catch {
    return res.code(503).send({ ok: false });
  }
});
app.get("/api/session", async (req, res) => {
  const s = await session(req.cookies.mp_session);
  if (!s) return res.code(401).send({ error: "NO_SESSION" });
  return { id: s.id, nickname: s.nickname };
});
app.post("/api/session", async (req, res) => {
  const p = z.object({ nickname: nicknameSchema }).safeParse(req.body);
  if (!p.success) return res.code(400).send({ error: "INVALID_NICKNAME" });
  const old = await session(req.cookies.mp_session);
  if (old) return { id: old.id, nickname: old.nickname };
  const token = randomBytes(32).toString("base64url");
  const s: Session = {
    id: randomUUID(),
    nickname: p.data.nickname,
    code: null,
    userId: null,
  };
  await redis.set(`session:${hash(token)}`, JSON.stringify(s), "EX", 86400 * 7);
  res.setCookie("mp_session", token, {
    path: "/",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 86400 * 7,
  });
  return { id: s.id, nickname: s.nickname };
});
async function authenticatedUser(token: string | undefined) {
  const s = await session(token);
  if (!s?.userId) return null;
  return db.user.findUnique({
    where: { id: s.userId },
    select: { id: true, email: true, nickname: true, role: true },
  });
}
app.get("/api/account", async (req, res) => {
  const user = await authenticatedUser(req.cookies.mp_session);
  return user ? user : res.code(401).send({ error: "NO_ACCOUNT" });
});
app.post("/api/accounts/register", async (req, res) => {
  const parsed = z
    .object({
      email: z.string().trim().email().max(254),
      nickname: nicknameSchema,
      password: z.string().min(12).max(256),
    })
    .safeParse(req.body);
  if (!parsed.success) return res.code(400).send({ error: "INVALID_ACCOUNT" });
  const existing = await session(req.cookies.mp_session);
  if (!existing) return res.code(401).send({ error: "NO_SESSION" });
  if (existing.userId)
    return res.code(409).send({ error: "ALREADY_AUTHENTICATED" });
  try {
    const user = await db.user.create({
      data: {
        email: parsed.data.email.toLowerCase(),
        nickname: parsed.data.nickname,
        role: adminEmails.has(parsed.data.email.toLowerCase()) ? "ADMIN" : "USER",
        passwordHash: await argon2.hash(parsed.data.password, {
          type: argon2.argon2id,
        }),
      },
      select: { id: true, email: true, nickname: true, role: true },
    });
    existing.userId = user.id;
    await redis.set(
      `session:${hash(req.cookies.mp_session!)}`,
      JSON.stringify(existing),
      "EX",
      86400 * 7,
    );
    return user;
  } catch (error) {
    if ((error as { code?: string }).code === "P2002")
      return res.code(409).send({ error: "EMAIL_EXISTS" });
    throw error;
  }
});
app.post("/api/accounts/login", async (req, res) => {
  const parsed = z
    .object({ email: z.string().trim().email(), password: z.string().min(1) })
    .safeParse(req.body);
  if (!parsed.success) return res.code(400).send({ error: "INVALID_ACCOUNT" });
  const existing = await session(req.cookies.mp_session);
  if (!existing) return res.code(401).send({ error: "NO_SESSION" });
  if (existing.userId)
    return res.code(409).send({ error: "ALREADY_AUTHENTICATED" });
  let user = await db.user.findUnique({
    where: { email: parsed.data.email.toLowerCase() },
  });
  if (!user?.passwordHash || !(await argon2.verify(user.passwordHash, parsed.data.password)))
    return res.code(401).send({ error: "INVALID_CREDENTIALS" });
  if (adminEmails.has(user.email?.toLowerCase() ?? "") && user.role !== "ADMIN") {
    user = await db.user.update({ where: { id: user.id }, data: { role: "ADMIN" } });
  }
  existing.userId = user.id;
  existing.nickname = user.nickname;
  await redis.set(
    `session:${hash(req.cookies.mp_session!)}`,
    JSON.stringify(existing),
    "EX",
    86400 * 7,
  );
  return { id: user.id, email: user.email, nickname: user.nickname, role: user.role };
});
app.post("/api/accounts/logout", async (req, res) => {
  const existing = await session(req.cookies.mp_session);
  if (!existing) return res.code(401).send({ error: "NO_SESSION" });
  existing.userId = null;
  await redis.set(
    `session:${hash(req.cookies.mp_session!)}`,
    JSON.stringify(existing),
    "EX",
    86400 * 7,
  );
  return { ok: true };
});
app.get("/api/templates", async (req, res) => {
  const parsed = z.object({
    q: z.string().trim().max(100).optional(),
    categories: z.string().max(300).optional(),
    family: z.enum(["0", "1"]).default("1"),
    limit: z.coerce.number().int().min(1).max(100).default(24),
    offset: z.coerce.number().int().min(0).max(10000).default(0),
  }).safeParse(req.query);
  if (!parsed.success) return res.code(400).send({ error: "INVALID_QUERY" });
  const categories = (parsed.data.categories?.split(",") ?? [])
    .filter((category) => categoryIds.includes(category as never));
  const where = {
    ...catalogueWhere({
      categories: categories.length ? categories as Config["categories"] : [...categoryIds],
      family: parsed.data.family === "1",
    }),
    ...(parsed.data.q
      ? { name: { contains: parsed.data.q, mode: "insensitive" as const } }
      : {}),
  };
  const [total, rows] = await Promise.all([
    db.template.count({ where }),
    db.template.findMany({
      where,
      select: publicTemplateSelect,
      orderBy: [{ moderationStatus: "asc" }, { name: "asc" }],
      skip: parsed.data.offset,
      take: parsed.data.limit,
    }),
  ]);
  return {
    total,
    offset: parsed.data.offset,
    limit: parsed.data.limit,
    templates: rows.map(publicTemplate),
  };
});

app.get("/api/templates/stats", async (req, res) => {
  const parsed = z.object({
    categories: z.string().max(300).optional(),
    family: z.enum(["0", "1"]).default("1"),
  }).safeParse(req.query);
  if (!parsed.success) return res.code(400).send({ error: "INVALID_QUERY" });
  const selected = (parsed.data.categories?.split(",") ?? [...categoryIds])
    .filter((category) => categoryIds.includes(category as never)) as Config["categories"];
  const total = await db.template.count({
    where: catalogueWhere({ categories: selected.length ? selected : [...categoryIds], family: parsed.data.family === "1" }),
  });
  return { total };
});

app.get("/api/templates/:id", async (req, res) => {
  const { id } = z.object({ id: z.string().min(1).max(180) }).parse(req.params);
  const template = await db.template.findFirst({
    where: { id, active: true, moderationStatus: { not: "REJECTED" } },
    select: publicTemplateSelect,
  });
  return template
    ? publicTemplate(template)
    : res.code(404).send({ error: "NOT_FOUND" });
});

app.get("/api/templates/:id/image", async (req, res) => {
  const { id } = z.object({ id: z.string().min(1).max(180) }).parse(req.params);
  const { thumbnail } = z.object({ thumbnail: z.enum(["0", "1"]).optional() }).parse(req.query);
  const template = await db.template.findFirst({
    where: { id, active: true, moderationStatus: { not: "REJECTED" } },
    select: { storagePath: true, thumbnailPath: true, mediaType: true },
  });
  if (!template) return res.code(404).send({ error: "NOT_FOUND" });
  const path = thumbnail === "1" && template.thumbnailPath
    ? template.thumbnailPath
    : template.storagePath;
  if (path.startsWith("http")) return res.redirect(path);
  res.type(template.mediaType === "jpg" ? "image/jpeg" : `image/${template.mediaType}`);
  return res.send(createReadStream(path));
});

app.post("/api/templates/:id/report", async (req, res) => {
  const s = await session(req.cookies.mp_session);
  if (!s) return res.code(401).send({ error: "NO_SESSION" });
  const { id } = z.object({ id: z.string().min(1).max(180) }).parse(req.params);
  const body = z.object({ reason: z.string().trim().min(3).max(300) }).safeParse(req.body);
  if (!body.success) return res.code(400).send({ error: "INVALID_REPORT" });
  try {
    await db.$transaction([
      db.templateReport.create({ data: { templateId: id, reporterKey: s.id, reason: body.data.reason } }),
      db.template.update({ where: { id }, data: { reportCount: { increment: 1 } } }),
    ]);
  } catch (error) {
    if ((error as { code?: string }).code === "P2002")
      return res.code(409).send({ error: "ALREADY_REPORTED" });
    throw error;
  }
  return res.code(201).send({ ok: true });
});

app.get("/api/admin/templates", async (req, res) => {
  const user = await authenticatedUser(req.cookies.mp_session);
  if (!user || user.role !== "ADMIN") return res.code(403).send({ error: "FORBIDDEN" });
  const parsed = z.object({
    q: z.string().trim().max(100).optional(),
    status: z.enum(["ALL", "UNREVIEWED", "APPROVED", "REJECTED"]).default("UNREVIEWED"),
    provider: z.string().trim().max(50).optional(),
    limit: z.coerce.number().int().min(1).max(100).default(24),
    offset: z.coerce.number().int().min(0).max(100000).default(0),
  }).safeParse(req.query);
  if (!parsed.success) return res.code(400).send({ error: "INVALID_QUERY" });
  const where = {
    ...(parsed.data.q ? { name: { contains: parsed.data.q, mode: "insensitive" as const } } : {}),
    ...(parsed.data.status !== "ALL" ? { moderationStatus: parsed.data.status } : {}),
    ...(parsed.data.provider ? { provider: parsed.data.provider } : {}),
  };
  const [total, rows, providers] = await Promise.all([
    db.template.count({ where }),
    db.template.findMany({
      where,
      orderBy: [{ reportCount: "desc" }, { createdAt: "desc" }],
      skip: parsed.data.offset,
      take: parsed.data.limit,
      select: {
        ...publicTemplateSelect,
        active: true,
        nsfw: true,
        reportCount: true,
        reports: {
          where: { status: "OPEN" },
          orderBy: { createdAt: "desc" },
          take: 3,
          select: { id: true, reason: true, createdAt: true },
        },
      },
    }),
    db.template.findMany({ distinct: ["provider"], select: { provider: true }, orderBy: { provider: "asc" } }),
  ]);
  return {
    total,
    offset: parsed.data.offset,
    limit: parsed.data.limit,
    providers: providers.map((row) => row.provider),
    templates: rows.map((row) => ({
      ...publicTemplate(row),
      active: row.active,
      nsfw: row.nsfw,
      reportCount: row.reportCount,
      reports: row.reports,
    })),
  };
});

app.get("/api/admin/templates/stats", async (req, res) => {
  const user = await authenticatedUser(req.cookies.mp_session);
  if (!user || user.role !== "ADMIN") return res.code(403).send({ error: "FORBIDDEN" });
  const [total, unreviewed, approved, rejected, openReports] = await Promise.all([
    db.template.count(),
    db.template.count({ where: { moderationStatus: "UNREVIEWED" } }),
    db.template.count({ where: { moderationStatus: "APPROVED" } }),
    db.template.count({ where: { moderationStatus: "REJECTED" } }),
    db.templateReport.count({ where: { status: "OPEN" } }),
  ]);
  return { total, unreviewed, approved, rejected, openReports };
});

app.patch("/api/admin/templates/:id", async (req, res) => {
  const user = await authenticatedUser(req.cookies.mp_session);
  if (!user || user.role !== "ADMIN") return res.code(403).send({ error: "FORBIDDEN" });
  const { id } = z.object({ id: z.string().min(1).max(180) }).parse(req.params);
  const body = z.object({
    active: z.boolean().optional(),
    moderationStatus: z.enum(["UNREVIEWED", "APPROVED", "REJECTED"]).optional(),
    rating: z.enum(["family", "general", "adult"]).optional(),
    nsfw: z.boolean().optional(),
    categories: z.array(z.enum(categoryIds)).min(1).max(categoryIds.length).optional(),
  }).parse(req.body);
  const template = await db.$transaction(async (tx) => {
    const updated = await tx.template.update({
      where: { id },
      data: {
        active: body.active,
        moderationStatus: body.moderationStatus,
        rating: body.rating,
        nsfw: body.nsfw,
        tags: body.categories,
      },
      select: publicTemplateSelect,
    });
    if (body.moderationStatus && body.moderationStatus !== "UNREVIEWED") {
      await tx.templateReport.updateMany({
        where: { templateId: id, status: "OPEN" },
        data: { status: "RESOLVED", reviewedAt: new Date() },
      });
    }
    return updated;
  });
  return publicTemplate(template);
});
app.post("/api/templates", async (req, res) => {
  const user = await authenticatedUser(req.cookies.mp_session);
  if (!user) return res.code(401).send({ error: "NO_ACCOUNT" });
  const file = await req.file();
  if (!file) return res.code(400).send({ error: "FILE_REQUIRED" });
  const field = (key: string) => {
    const value = (file.fields as Record<string, unknown>)[key];
    if (!value || Array.isArray(value) || typeof value !== "object") return undefined;
    return "value" in value ? (value as { value: unknown }).value : undefined;
  };
  const name = z.string().trim().min(2).max(80).safeParse(field("name"));
  if (!name.success) return res.code(400).send({ error: "INVALID_NAME" });
  const source = await file.toBuffer();
  let metadata: Metadata;
  try {
    metadata = await sharp(source, { animated: true }).metadata();
  } catch {
    return res.code(400).send({ error: "INVALID_IMAGE" });
  }
  if (
    !metadata.format ||
    !["jpeg", "png", "webp", "gif"].includes(metadata.format) ||
    !metadata.width ||
    !metadata.height ||
    metadata.width > 8000 ||
    metadata.height > 8000
  )
    return res.code(400).send({ error: "INVALID_IMAGE" });
  const id = randomUUID();
  const uploadDir = process.env.UPLOAD_DIR ?? join(process.cwd(), "data", "uploads");
  await mkdir(uploadDir, { recursive: true });
  const imagePath = join(uploadDir, `${id}.webp`);
  const thumbnailPath = join(uploadDir, `${id}.thumb.webp`);
  await Promise.all([
    sharp(source, { animated: false }).webp({ quality: 85 }).toFile(imagePath),
    sharp(source, { animated: false })
      .resize({ width: 480, height: 480, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 78 })
      .toFile(thumbnailPath),
  ]);
  const template = await db.template.create({
    data: {
      id,
      ownerId: user.id,
      name: name.data,
      description: z.string().trim().max(500).catch("").parse(field("description")),
      mediaType: metadata.format,
      storagePath: imagePath,
      thumbnailPath,
      width: metadata.width,
      height: metadata.height,
      tags: z.string().catch("").parse(field("tags")).split(",").map((tag) => tag.trim()).filter(Boolean).slice(0, 12),
      provider: "upload",
      moderationStatus: "UNREVIEWED",
      active: false,
    },
  });
  return res.code(201).send({
    id: template.id,
    name: template.name,
    mediaType: template.mediaType,
    width: template.width,
    height: template.height,
    tags: template.tags,
  });
});
const io = new Server<
  ClientEvents,
  ServerEvents,
  Record<string, never>,
  { player: Session; tokenHash: string }
>(app.server, {
  cors: { origin, credentials: true },
  transports: ["websocket"],
  maxHttpBufferSize: 20000,
});
io.adapter(createAdapter(redis.duplicate(), redis.duplicate()));
io.use(async (socket, next) => {
  try {
    if (socket.handshake.headers.origin !== origin)
      throw Error("INVALID_ORIGIN");
    const token = app.parseCookie(
      socket.handshake.headers.cookie ?? "",
    ).mp_session;
    const s = await session(token);
    if (!s || !token) throw Error("NO_SESSION");
    socket.data.player = s;
    socket.data.tokenHash = hash(token);
    next();
  } catch {
    next(Error("UNAUTHORIZED"));
  }
});
async function broadcast(code: string) {
  const l = await load(code);
  if (!l) return;
  const e = new Engine(l, modes);
  for (const sock of io.sockets.sockets.values()) {
    if (sock.data.player.code === code) {
      if (l.banned.includes(sock.data.player.id)) {
        sock.emit("lobby:kicked");
        sock.data.player.code = null;
        await redis.set(
          `session:${sock.data.tokenHash}`,
          JSON.stringify(sock.data.player),
          "EX",
          86400 * 7,
        );
      } else
        sock.emit("lobby:state", e.snapshot(sock.data.player.id, Date.now()));
    }
  }
}
const updates = redis.duplicate();
await updates.subscribe("lobby-updates");
updates.on("message", (_, key) => {
  void broadcast(key.slice(6)).catch((err) =>
    app.log.error({ err }, "broadcast failed"),
  );
});
io.on("connection", (socket) => {
  const s = socket.data.player;
  const socketsKey = `sockets:${s.id}`;
  void redis.zadd(socketsKey, Date.now() + 60000, socket.id);
  void redis.expire(socketsKey, 120);
  const heartbeat = setInterval(() => {
    void redis.zadd(socketsKey, Date.now() + 60000, socket.id);
    void redis.expire(socketsKey, 120);
  }, 15000);
  async function bind(code: string) {
    s.code = code;
    await redis.set(
      `session:${socket.data.tokenHash}`,
      JSON.stringify(s),
      "EX",
      86400 * 7,
    );
    await socket.join(code);
    await broadcast(code);
  }
  async function leavePrevious() {
    if (s.code) {
      const old = await load(s.code);
      if (old?.players.some((p) => p.id === s.id) && old.phase !== "FINISHED")
        throw Error("ALREADY_IN_LOBBY");
      await socket.leave(s.code);
    }
  }
  function guard<T>(ack: (reply: Reply<T>) => void, work: () => Promise<T>) {
    if (typeof ack !== "function") return;
    void (async () => {
      try {
        await limit(`actions:${s.id}`, 60, 10);
        ack({ ok: true, data: await work() });
      } catch (err) {
        const error = err instanceof Error ? err.message : "INTERNAL";
        ack({
          ok: false,
          error: [
            "BUSY",
            "NOT_FOUND",
            "HOST_ONLY",
            "LOBBY_FULL",
            "GAME_STARTED",
            "ALREADY_IN_LOBBY",
            "BANNED",
            "WRONG_PHASE",
            "NOT_READY",
            "EMPTY_INPUT",
            "TEXT_TOO_LONG",
            "ALREADY_SUBMITTED",
            "SELF_VOTE",
            "ALREADY_VOTED",
            "INVALID_VOTE",
            "ALREADY_BUDDY",
            "REROLL_LIMIT",
            "NO_ALTERNATIVE",
            "NO_TEMPLATES",
            "INVALID_BUDDY",
            "INVALID_TARGET",
            "INVITE_REQUIRED",
            "INVITE_INVALID",
            "RATE_LIMIT",
          ].includes(error)
            ? error
            : "INVALID_REQUEST",
        });
      }
    })();
  }
  socket.on("lobby:create", (payload, ack) =>
    guard(ack, async () => {
      await leavePrevious();
      const p = z
        .object({
          name: z.string().trim().min(2).max(48),
          config: configSchema,
        })
        .parse(payload);
      await limit(`create:${s.id}`, 5, 60);
      let code = "";
      for (let attempt = 0; attempt < 5; attempt++) {
        code = Array.from(
          randomBytes(6),
          (b) => "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"[b % 32],
        ).join("");
        try {
          await saveNew(
            createLobby(
              code,
              p.name,
              s.id,
              s.nickname,
              p.config,
              Date.now(),
              await templatePool(p.config),
            ),
          );
          break;
        } catch (err) {
          if (attempt === 4) throw err;
        }
      }
      await bind(code);
      return { code };
    }),
  );
  socket.on("lobby:join", (payload, ack) =>
    guard(ack, async () => {
      const { code, inviteToken } = z
        .object({
          code: z.string().regex(/^[A-Z2-9]{6}$/),
          inviteToken: z.string().regex(/^[A-Za-z0-9_-]{32}$/).optional(),
        })
        .parse(payload);
      if (s.code !== code) await leavePrevious();
      await mutate(code, (e) =>
        e.join(s.id, s.nickname, Date.now(), inviteToken),
      );
      await bind(code);
      return { code };
    }),
  );
  socket.on("lobby:restore", (ack) =>
    guard(ack, async () => {
      if (!s.code) return null;
      const l = await load(s.code);
      if (
        !l ||
        !l.players.some((p) => p.id === s.id) ||
        l.banned.includes(s.id)
      ) {
        s.code = null;
        await redis.set(
          `session:${socket.data.tokenHash}`,
          JSON.stringify(s),
          "EX",
          86400 * 7,
        );
        return null;
      }
      await mutate(s.code, (e) => e.join(s.id, s.nickname, Date.now()));
      await bind(s.code);
      return { code: s.code };
    }),
  );
  socket.on("lobby:leave", (ack) =>
    guard(ack, async () => {
      if (!s.code) return undefined;
      const code = s.code;
      await mutate(code, (e) => e.leave(s.id, Date.now()));
      await socket.leave(code);
      s.code = null;
      await redis.set(
        `session:${socket.data.tokenHash}`,
        JSON.stringify(s),
        "EX",
        86400 * 7,
      );
      return undefined;
    }),
  );
  socket.on("lobby:create-invite", (ack) =>
    guard(ack, async () => {
      if (!s.code) throw Error("NOT_FOUND");
      const token = randomBytes(24).toString("base64url");
      await mutate(s.code, (e) => e.createInvite(s.id, token, Date.now()));
      return { token };
    }),
  );
  socket.on("game:action", (payload, ack) =>
    guard(ack, async () => {
      if (!s.code) throw Error("NOT_FOUND");
      const action = actionSchema.parse(payload);
      if (action.type === "chat") await limit(`chat:${s.id}`, 5, 10);
      const nextPool = action.type === "config" ? await templatePool(action.config) : null;
      await mutate(s.code, (e) => {
        if (nextPool) e.setTemplatePool(nextPool);
        e.action(s.id, action, Date.now());
      });
      return undefined;
    }),
  );
  socket.on("disconnect", () => {
    const disconnectedAt = Date.now();
    clearInterval(heartbeat);
    void (async () => {
      await redis.zrem(socketsKey, socket.id);
      await redis.zremrangebyscore(socketsKey, 0, Date.now());
      if (s.code && (await redis.zcard(socketsKey)) === 0)
        await mutateWithRetry(s.code, (e) =>
          e.disconnect(s.id, disconnectedAt),
        );
    })().catch((err) => app.log.error({ err }, "disconnect failed"));
  });
});
// A shared heartbeat updates only due phases or disconnected hosts, under a fenced Redis lock.
setInterval(() => {
  void (async () => {
    for (const code of await redis.smembers("lobbies")) {
      const l = await load(code);
      if (!l) {
        await redis.srem("lobbies", code);
        continue;
      }
      const now = Date.now();
      let expired = false;
      for (const p of l.players.filter((p) => p.connected)) {
        await redis.zremrangebyscore(`sockets:${p.id}`, 0, now);
        if ((await redis.zcard(`sockets:${p.id}`)) === 0) {
          await mutate(code, (e) => {
            const current = e.lobby.players.find((q) => q.id === p.id);
            if (current?.connected) e.disconnect(p.id, now);
          }).catch(() => {});
          expired = true;
        }
      }
      if (expired) continue;
      const host = l.players.find((p) => p.id === l.hostId);
      if (
        (l.phaseEnd !== null && now >= l.phaseEnd) ||
        (!host?.connected &&
          l.players.some((p) => p.connected) &&
          now - (host?.disconnectedAt ?? 0) >= 15000)
      ) {
        await mutate(code, (e) => e.update(now)).catch((err) => {
          if (err.message !== "BUSY") app.log.error({ err }, "tick failed");
        });
      }
    }
  })().catch((err) => app.log.error({ err }, "heartbeat failed"));
}, 1000);
await syncTemplateCatalog();
void consumeEvents();
await app.listen({
  port: Number(process.env.PORT ?? 3001),
  host: process.env.BIND_HOST ?? "0.0.0.0",
});
