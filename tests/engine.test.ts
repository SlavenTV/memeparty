import { modes } from "@memeparty/game-modes";
import { test } from "node:test";
import assert from "node:assert/strict";
import { Engine, createLobby } from "@memeparty/game-engine";
import { configSchema, inputSchema, actionSchema } from "@memeparty/shared";
import { likeDislike, positive, stars } from "@memeparty/game-modes";
const A = "00000000-0000-4000-8000-000000000001",
  B = "00000000-0000-4000-8000-000000000002";
const input = inputSchema.parse({
  layers: [
    {
      text: "Hello!",
      x: 5,
      y: 5,
      width: 90,
      size: 30,
      color: "#ffffff",
      outline: 2,
      rotation: 0,
      uppercase: true,
      align: "center",
    },
  ],
});
function game(config = {}) {
  const l = createLobby(
    "ABC234",
    "Party",
    A,
    "Alpha",
    configSchema.parse({
      rounds: 2,
      inputSeconds: 10,
      voteSeconds: 10,
      ...config,
    }),
    0,
  );
  const e = new Engine(l, modes);
  e.join(B, "Bravo", 0);
  return e;
}
function start(e: Engine) {
  e.action(A, { type: "ready", ready: true }, 0);
  e.action(B, { type: "ready", ready: true }, 0);
  e.action(A, { type: "start" }, 0);
  while (e.lobby.phase !== "INPUT") e.update(e.lobby.phaseEnd!);
}
function voting(e: Engine) {
  start(e);
  const now = e.lobby.phaseStart;
  e.action(A, { type: "submit", input }, now);
  e.action(B, { type: "submit", input }, now);
  while (e.lobby.phase !== "VOTING") e.update(e.lobby.phaseEnd!);
}
test("host permissions and all-ready check", () => {
  const e = game();
  assert.throws(() => e.action(B, { type: "start" }, 0), /HOST_ONLY/);
  assert.throws(() => e.action(A, { type: "start" }, 0), /NOT_READY/);
  start(e);
  assert.equal(e.lobby.phase, "INPUT");
});
test("streamer lobbies require a one-time host invite for new players", () => {
  const l = createLobby(
    "ABC234",
    "Streamer lobby",
    A,
    "Alpha",
    configSchema.parse({ streamerMode: true }),
    0,
  );
  const e = new Engine(l, modes);
  assert.throws(() => e.join(B, "Bravo", 0), /INVITE_REQUIRED/);
  const token = "a".repeat(32);
  e.createInvite(A, token, 0);
  e.join(B, "Bravo", 1, token);
  assert.equal(e.lobby.players.length, 2);
  assert.throws(
    () => e.join("00000000-0000-4000-8000-000000000003", "Charlie", 2, token),
    /INVITE_INVALID/,
  );
});
test("server deadlines cannot be bypassed", () => {
  const e = game();
  start(e);
  assert.throws(
    () => e.action(A, { type: "submit", input }, e.lobby.phaseEnd!),
    /WRONG_PHASE/,
  );
  assert.equal(e.lobby.round!.submissions.length, 0);
});
test("reject duplicate submissions, self votes and duplicate votes", () => {
  const e = game();
  voting(e);
  const a = e.lobby.round!.submissions[0];
  assert.throws(
    () =>
      e.action(
        A,
        { type: "vote", submissionId: a.id, value: 1 },
        e.lobby.phaseStart,
      ),
    /SELF_VOTE/,
  );
  e.action(
    B,
    { type: "vote", submissionId: a.id, value: 1 },
    e.lobby.phaseStart,
  );
  assert.throws(
    () =>
      e.action(
        B,
        { type: "vote", submissionId: a.id, value: -1 },
        e.lobby.phaseStart,
      ),
    /ALREADY_VOTED/,
  );
  assert.throws(
    () =>
      e.action(
        B,
        { type: "vote", submissionId: a.id, value: 1 },
        e.lobby.phaseEnd!,
      ),
    /WRONG_PHASE/,
  );
});
test("the input phase advances as soon as every connected player submits", () => {
  const e = game({ inputSeconds: 300 });
  start(e);
  const now = e.lobby.phaseStart;
  e.action(A, { type: "submit", input }, now);
  assert.equal(e.lobby.phase, "INPUT");
  e.action(B, { type: "submit", input }, now + 1);
  assert.equal(e.lobby.phase, "INPUT_LOCKED");
  assert.equal(e.lobby.phaseStart, now + 1);
});
test("anonymous projections never expose author or votes before results", () => {
  const e = game();
  voting(e);
  const view = e.snapshot(A, e.lobby.phaseStart);
  assert.equal(view.submissions[0].playerId, undefined);
  assert.equal(view.submissions[0].own, true);
  assert.equal(view.submissions[1].own, false);
  assert.equal(view.submissions[0].points, undefined);
  assert.deepEqual(view.myVotes, {});
  assert.equal("votes" in view, false);
});
test("hidden inputs remain private during input phase", () => {
  const e = game();
  start(e);
  e.action(A, { type: "submit", input }, e.lobby.phaseStart);
  assert.equal(e.snapshot(B, e.lobby.phaseStart).submissions.length, 0);
  assert.equal(e.snapshot(B, e.lobby.phaseStart).myInput, null);
});
test("draft, score and voting survive disconnect and reconnect", () => {
  const e = game();
  start(e);
  e.action(A, { type: "draft", input }, e.lobby.phaseStart);
  e.disconnect(A, 4000);
  e.join(A, "Alpha", 5000);
  assert.deepEqual(e.snapshot(A, 5000).myInput, input);
  e.action(A, { type: "submit", input }, 5000);
  assert.throws(
    () => e.action(A, { type: "submit", input }, 5000),
    /ALREADY_SUBMITTED/,
  );
});
test("host migrates after timeout, returning host cannot reclaim", () => {
  const e = game();
  e.disconnect(A, 100);
  e.update(15099);
  assert.equal(e.lobby.hostId, A);
  e.update(15100);
  assert.equal(e.lobby.hostId, B);
  e.join(A, "Alpha", 16000);
  assert.equal(e.lobby.hostId, B);
});
test("points and buddy are scored once, server drives complete two-round game", () => {
  const e = game();
  voting(e);
  const r = e.lobby.round!;
  e.action(
    B,
    { type: "vote", submissionId: r.submissions[0].id, value: 1 },
    e.lobby.phaseStart,
  );
  e.action(
    B,
    { type: "buddy", submissionId: r.submissions[0].id },
    e.lobby.phaseStart,
  );
  e.update(e.lobby.phaseEnd!);
  assert.equal(e.lobby.players[0].score, 100);
  assert.equal(e.lobby.players[1].score, 25);
  e.score(e.lobby.phaseStart);
  assert.equal(e.lobby.players[0].score, 100);
  while (e.lobby.phase !== "FINISHED") e.update(e.lobby.phaseEnd!);
  assert.equal(e.lobby.round!.number, 2);
});
test("relaxed has no scores; host controls next round", () => {
  const e = game({ mode: "relaxed", hostNext: true });
  voting(e);
  e.action(
    B,
    { type: "vote", submissionId: e.lobby.round!.submissions[0].id, value: 1 },
    e.lobby.phaseStart,
  );
  e.update(e.lobby.phaseEnd!);
  assert.equal(e.lobby.players[0].score, 0);
  assert.equal(e.lobby.phaseEnd, null);
  assert.throws(() => e.action(B, { type: "next" }, 99999), /HOST_ONLY/);
  e.action(A, { type: "next" }, 99999);
  assert.equal(e.lobby.phase, "NEXT_ROUND");
});
test("kicks cannot target host; kicked players cannot reconnect", () => {
  const e = game();
  assert.throws(
    () => e.action(A, { type: "kick", playerId: A }, 0),
    /INVALID_TARGET/,
  );
  e.action(A, { type: "kick", playerId: B }, 0);
  assert.throws(() => e.join(B, "Bravo", 0), /BANNED/);
});
test("validation rejects malformed events and script colors", () => {
  assert.equal(
    actionSchema.safeParse({ type: "vote", value: 999, submissionId: A })
      .success,
    false,
  );
  assert.equal(
    inputSchema.safeParse({
      layers: [{ ...input.layers[0], color: "url(javascript:alert(1))" }],
    }).success,
    false,
  );
  assert.equal(
    inputSchema.safeParse({
      layers: [{ ...input.layers[0], font: "url(evil-font)" }],
    }).success,
    false,
  );
  const legacyLayer = { ...input.layers[0] } as Record<string, unknown>;
  delete legacyLayer.font;
  assert.equal(inputSchema.parse({ layers: [legacyLayer] }).layers[0].font, "impact");
});
test("scoring strategies handle downvotes independently", () => {
  const votes = [
    { playerId: A, submissionId: "s", value: 1 },
    { playerId: B, submissionId: "s", value: -1 },
  ];
  assert.equal(likeDislike.score(votes, "s"), 0);
  assert.equal(positive.score(votes, "s"), 100);
  assert.equal(
    stars.score(
      [
        { playerId: A, submissionId: "s", value: 4 },
        { playerId: B, submissionId: "s", value: 5 },
      ],
      "s",
    ),
    450,
  );
});
test("lifecycle hooks run inside the server-authoritative phase loop", () => {
  let inputStarted = false;
  const l = createLobby(
    "ABC234",
    "Party",
    A,
    "Alpha",
    configSchema.parse({ inputSeconds: 10, voteSeconds: 10 }),
    0,
  );
  const hookedModes = {
    ...modes,
    same: {
      ...modes.same,
      phases: { INPUT: { start: () => (inputStarted = true) } },
    },
  };
  const e = new Engine(l, hookedModes);
  e.join(B, "Bravo", 0);
  e.action(A, { type: "ready", ready: true }, 0);
  e.action(B, { type: "ready", ready: true }, 0);
  e.action(A, { type: "start" }, 0);
  while (e.lobby.phase !== "INPUT") e.update(e.lobby.phaseEnd!);
  assert.equal(inputStarted, true);
});

test("host can restart after results with a fresh game ID and reset scores", () => {
  const e = game({ rounds: 1 });
  assert.throws(() => e.action(A, { type: "restart" }, 0), /WRONG_PHASE/);
  voting(e);
  e.update(e.lobby.phaseEnd!);
  e.update(e.lobby.phaseEnd!);
  assert.equal(e.lobby.phase, "GAME_RESULTS");
  assert.throws(
    () => e.action(B, { type: "restart" }, e.lobby.phaseStart),
    /HOST_ONLY/,
  );
  const gameId = e.lobby.gameId;
  e.action(A, { type: "restart" }, e.lobby.phaseStart);
  assert.equal(e.lobby.phase, "LOBBY");
  assert.notEqual(e.lobby.gameId, gameId);
  assert.equal(e.lobby.round, null);
  assert.ok(e.lobby.players.every((p) => p.score === 0 && !p.ready));
  assert.equal(e.lobby.players.length, 2);
});

test("a delayed disconnect cannot overwrite a newer reconnect", () => {
  const e = game();
  e.disconnect(A, 100);
  e.join(A, "Alpha", 200);
  e.disconnect(A, 100);
  assert.equal(e.lobby.players.find((p) => p.id === A)?.connected, true);
});

test("a player can leave a running game and no longer blocks the round", () => {
  const e = game();
  start(e);
  const now = e.lobby.phaseStart;
  e.action(A, { type: "submit", input }, now);
  e.leave(B, now + 1);

  assert.equal(e.lobby.players.some((player) => player.id === B), false);
  assert.equal(e.lobby.round?.assignments[B], undefined);
  assert.equal(e.lobby.round?.submissions.some((s) => s.playerId === B), false);
  assert.equal(e.lobby.phase, "INPUT_LOCKED");
});

test("categories restrict assignments in all modes and require a selection", () => {
  assert.equal(configSchema.safeParse({ categories: [] }).success, false);
  assert.equal(
    configSchema.safeParse({ categories: ["unknown"] }).success,
    false,
  );
  for (const mode of ["same", "normal", "topic", "relaxed", "chaos"]) {
    const e = game({ mode, categories: ["originals"] });
    start(e);
    assert.ok(
      Object.values(e.lobby.round!.assignments).every((id) =>
        ["deadline", "plan", "weekend"].includes(id),
      ),
    );
  }
});
test("rerolls are private, preserve drafts and enforce per-player server limits", () => {
  const e = game({ rerolls: 2, categories: ["originals"] });
  assert.throws(() => e.action(A, { type: "reroll" }, 0), /WRONG_PHASE/);
  start(e);
  const now = e.lobby.phaseStart;
  const original = e.lobby.round!.assignments[A];
  const other = e.lobby.round!.assignments[B];
  e.action(A, { type: "draft", input }, now);
  e.action(A, { type: "reroll" }, now);
  assert.notEqual(e.lobby.round!.assignments[A], original);
  assert.equal(e.lobby.round!.assignments[B], other);
  assert.equal(e.snapshot(A, now).rerollsRemaining, 1);
  assert.equal(e.snapshot(B, now).rerollsRemaining, 2);
  assert.deepEqual(e.snapshot(A, now).myInput, input);
  e.disconnect(A, now + 1);
  e.join(A, "Alpha", now + 2);
  assert.equal(e.snapshot(A, now + 2).rerollsRemaining, 1);
  e.action(A, { type: "reroll" }, now + 2);
  assert.throws(() => e.action(A, { type: "reroll" }, now + 2), /REROLL_LIMIT/);
  const chosen = e.lobby.round!.assignments[A];
  e.action(A, { type: "submit", input }, now + 2);
  assert.equal(e.lobby.round!.submissions[0].templateId, chosen);
  assert.throws(
    () => e.action(A, { type: "reroll" }, now + 2),
    /ALREADY_SUBMITTED/,
  );
  while (e.lobby.phase !== "ROUND_RESULTS") e.update(e.lobby.phaseEnd!);
  e.update(e.lobby.phaseEnd!);
  e.update(e.lobby.phaseEnd!);
  assert.equal(e.snapshot(A, e.lobby.phaseStart).rerollsRemaining, 2);
});
test("zero rerolls disables switching and old lobby configs receive defaults", () => {
  const e = game({ rerolls: 0 });
  start(e);
  assert.throws(
    () => e.action(A, { type: "reroll" }, e.lobby.phaseStart),
    /REROLL_LIMIT/,
  );
  const old = game().lobby;
  delete (old.config as Partial<typeof old.config>).rerolls;
  delete (old.config as Partial<typeof old.config>).categories;
  const restored = new Engine(old, modes);
  assert.equal(restored.lobby.config.rerolls, 2);
  assert.ok(restored.lobby.config.categories.length);
});
test("a lobby configuration can grant more than ten rerolls", () => {
  const e = game({ rerolls: 12, categories: ["originals"] });
  start(e);
  const now = e.lobby.phaseStart;
  for (let change = 0; change < 12; change++) {
    e.action(A, { type: "reroll" }, now + change);
    assert.equal(e.snapshot(A, now + change).rerollsRemaining, 11 - change);
  }
  assert.throws(
    () => e.action(A, { type: "reroll" }, now + 13),
    /REROLL_LIMIT/,
  );
});
