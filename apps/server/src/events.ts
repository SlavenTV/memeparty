import { PrismaClient, type Prisma } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { redis } from "./store";
import type { DomainEvent } from "@memeparty/game-engine";
export const db = new PrismaClient();
export async function consumeEvents() {
  const client = redis.duplicate();
  const consumer = randomUUID();
  await client
    .xgroup("CREATE", "domain-events", "persist", "0", "MKSTREAM")
    .catch(() => {});
  while (true) {
    try {
      const reclaimed = (await client.xautoclaim(
        "domain-events",
        "persist",
        consumer,
        60000,
        "0-0",
        "COUNT",
        20,
      )) as [string, [string, string[]][]];
      const fresh = (await client.xreadgroup(
        "GROUP",
        "persist",
        consumer,
        "COUNT",
        20,
        "BLOCK",
        1000,
        "STREAMS",
        "domain-events",
        ">",
      )) as [string, [string, string[]][]][] | null;
      const rows = [...reclaimed[1], ...(fresh?.[0]?.[1] ?? [])];
      for (const [id, fields] of rows) {
        const e = JSON.parse(fields[1]) as DomainEvent;
        await db.domainEvent.upsert({
          where: { id },
          create: {
            id,
            type: e.type,
            gameId: e.gameId,
            lobbyCode: e.lobbyCode,
            payload: JSON.stringify(e),
            createdAt: new Date(e.at),
          },
          update: {},
        });
        if (e.type === "GameFinished") {
          const payload = e.payload as {
            mode?: string;
            config?: Record<string, unknown>;
            players?: { id: string; score: number }[];
          };
          const sorted = [...(payload.players ?? [])].sort(
            (left, right) => right.score - left.score,
          );
          await db.gameHistory.upsert({
            where: { id: e.gameId },
            create: {
              id: e.gameId,
              lobbyCode: e.lobbyCode,
              mode: payload.mode ?? "unknown",
              config: JSON.parse(
                JSON.stringify(payload.config ?? {}),
              ) as Prisma.InputJsonValue,
              results: {
                create: sorted.map((player, index) => ({
                  playerId: player.id,
                  nickname: player.id,
                  score: player.score,
                  placement: index + 1,
                })),
              },
            },
            update: {},
          });
        }
        await client.xack("domain-events", "persist", id);
        await client.xdel("domain-events", id);
      }
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }
}
