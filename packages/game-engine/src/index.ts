import { randomUUID } from "node:crypto";
import type { GameMode } from "@memeparty/game-modes";
import {
  availableTemplates,
  configSchema,
  type Action,
  type Config,
  type Lobby,
  type Phase,
  type Snapshot,
} from "@memeparty/shared";
export interface DomainEvent {
  type: string;
  lobbyCode: string;
  gameId: string;
  at: number;
  payload: Record<string, unknown>;
}
export type Emit = (event: DomainEvent) => void;
export function createLobby(
  code: string,
  name: string,
  hostId: string,
  nickname: string,
  config: Config,
  now: number,
  templatePool = availableTemplates(config).map((template) => template.id),
): Lobby {
  return {
    code,
    name,
    hostId,
    config,
    templatePool,
    players: [
      {
        id: hostId,
        nickname,
        connected: true,
        connectedAt: now,
        ready: false,
        disconnectedAt: null,
        score: 0,
      },
    ],
    phase: "LOBBY",
    phaseStart: now,
    phaseEnd: null,
    round: null,
    revision: 0,
    chat: [],
    banned: [],
    invites: {},
    gameId: randomUUID(),
    createdAt: now,
  };
}
export function requireHost(l: Lobby, id: string) {
  if (l.hostId !== id) throw Error("HOST_ONLY");
}
const after: Partial<Record<Phase, Phase>> = {
  PREPARING: "ROUND_INTRO",
  ROUND_INTRO: "INPUT",
  INPUT: "INPUT_LOCKED",
  INPUT_LOCKED: "PRESENTATION",
  PRESENTATION: "VOTING",
  VOTING: "ROUND_RESULTS",
  NEXT_ROUND: "ROUND_INTRO",
  GAME_RESULTS: "FINISHED",
};
export class Engine {
  constructor(
    public lobby: Lobby,
    private modes: Record<string, GameMode>,
    private emit: Emit = () => {},
  ) {
    this.lobby.config = configSchema.parse(this.lobby.config);
    this.lobby.invites ??= {};
    this.lobby.templatePool ??= availableTemplates(this.lobby.config).map(
      (template) => template.id,
    );
  }
  setTemplatePool(templatePool: string[]) {
    if (!templatePool.length) throw Error("NO_TEMPLATES");
    this.lobby.templatePool = [...new Set(templatePool)];
  }
  event(type: string, now: number, payload: Record<string, unknown> = {}) {
    this.emit({
      type,
      lobbyCode: this.lobby.code,
      gameId: this.lobby.gameId,
      at: now,
      payload,
    });
  }
  join(id: string, nickname: string, now: number, inviteToken?: string) {
    const l = this.lobby;
    if (l.banned.includes(id)) throw Error("BANNED");
    const old = l.players.find((p) => p.id === id);
    if (old) {
      old.connected = true;
      old.connectedAt = now;
      old.disconnectedAt = null;
      this.event("PlayerReconnected", now, { playerId: id });
      this.mode().phases[l.phase]?.onReconnect?.({
        lobby: l,
        now,
        playerId: id,
      });
      return;
    }
    if (l.phase !== "LOBBY") throw Error("GAME_STARTED");
    if (l.players.length >= l.config.maxPlayers) throw Error("LOBBY_FULL");
    if (l.config.streamerMode) {
      const invite = inviteToken ? l.invites[inviteToken] : undefined;
      if (!invite) throw Error("INVITE_REQUIRED");
      if (invite.expiresAt < now || invite.uses >= invite.maxUses)
        throw Error("INVITE_INVALID");
      invite.uses++;
    }
    l.players.push({
      id,
      nickname,
      connected: true,
      connectedAt: now,
      ready: false,
      disconnectedAt: null,
      score: 0,
    });
    this.event("PlayerJoinedLobby", now, { playerId: id });
    this.mode().phases[l.phase]?.onPlayerJoin?.({
      lobby: l,
      now,
      playerId: id,
    });
  }
  disconnect(id: string, now: number) {
    const p = this.lobby.players.find((p) => p.id === id);
    if (p && now >= (p.connectedAt ?? 0)) {
      p.connected = false;
      p.disconnectedAt = now;
      this.event("PlayerDisconnected", now, { playerId: id });
      this.mode().phases[this.lobby.phase]?.onPlayerLeave?.({
        lobby: this.lobby,
        now,
        playerId: id,
      });
      if (this.lobby.phase === "INPUT" && this.hasAllRequiredSubmissions())
        this.finish(now);
    }
  }
  leave(id: string, now: number) {
    const l = this.lobby;
    if (!l.players.some((player) => player.id === id)) throw Error("NOT_MEMBER");

    // Leaving a running game is deliberately different from a temporary
    // disconnect: the player must no longer keep the lobby tied to their
    // session, nor delay the input phase for everyone else.
    const round = l.round;
    if (round) {
      const removedSubmissions = new Set(
        round.submissions
          .filter((submission) => submission.playerId === id)
          .map((submission) => submission.id),
      );
      delete round.assignments[id];
      delete round.drafts[id];
      delete round.rerollsUsed[id];
      delete round.buddies[id];
      round.submissions = round.submissions.filter(
        (submission) => submission.playerId !== id,
      );
      round.votes = round.votes.filter(
        (vote) =>
          vote.playerId !== id && !removedSubmissions.has(vote.submissionId),
      );
      for (const [playerId, submissionId] of Object.entries(round.buddies)) {
        if (removedSubmissions.has(submissionId)) delete round.buddies[playerId];
      }
    }
    l.players = l.players.filter((player) => player.id !== id);
    if (l.hostId === id) {
      const nextHost = l.players.find((player) => player.connected) ?? l.players[0];
      if (nextHost) {
        l.hostId = nextHost.id;
        this.event("HostChanged", now, { playerId: nextHost.id });
      }
    }
    this.mode().phases[l.phase]?.onPlayerLeave?.({
      lobby: l,
      now,
      playerId: id,
    });
    this.event("PlayerLeftLobby", now, { playerId: id });
    if (l.phase === "INPUT" && this.hasAllRequiredSubmissions()) this.finish(now);
  }
  createInvite(id: string, token: string, now: number) {
    requireHost(this.lobby, id);
    if (this.lobby.phase !== "LOBBY") throw Error("WRONG_PHASE");
    this.lobby.invites[token] = {
      uses: 0,
      maxUses: 1,
      expiresAt: now + 1000 * 60 * 60 * 24,
    };
  }
  action(id: string, a: Action, now: number) {
    const l = this.lobby;
    const p = l.players.find((p) => p.id === id);
    if (!p || !p.connected) throw Error("NOT_MEMBER");
    if (l.phaseEnd !== null && now >= l.phaseEnd) this.update(now);
    this.mode().phases[l.phase]?.validateAction?.({ lobby: l, now });
    switch (a.type) {
      case "ready":
        if (l.phase !== "LOBBY") throw Error("WRONG_PHASE");
        p.ready = a.ready;
        break;
      case "config":
        requireHost(l, id);
        if (l.phase !== "LOBBY") throw Error("WRONG_PHASE");
        if (a.config.maxPlayers < l.players.length) throw Error("LOBBY_FULL");
        l.config = a.config;
        l.players.forEach((p) => (p.ready = false));
        break;
      case "start":
        requireHost(l, id);
        if (l.phase !== "LOBBY") throw Error("WRONG_PHASE");
        if (
          l.players.filter((p) => p.connected && p.ready).length <
            this.modes[l.config.mode].minPlayers ||
          l.players.some((p) => !p.connected || !p.ready)
        )
          throw Error("NOT_READY");
        this.modes[l.config.mode].setupGame(l);
        this.event("GameStarted", now);
        this.start("PREPARING", now);
        break;
      case "restart":
        requireHost(l, id);
        if (!["GAME_RESULTS", "FINISHED"].includes(l.phase))
          throw Error("WRONG_PHASE");
        l.gameId = randomUUID();
        l.round = null;
        for (const player of l.players) {
          player.score = 0;
          player.ready = false;
        }
        this.start("LOBBY", now);
        this.event("LobbyRestarted", now);
        break;
      case "next":
        requireHost(l, id);
        if (l.phase !== "ROUND_RESULTS") throw Error("WRONG_PHASE");
        this.finish(now);
        break;
      case "reroll": {
        if (l.phase !== "INPUT" || !l.round) throw Error("WRONG_PHASE");
        if (l.round.submissions.some((s) => s.playerId === id))
          throw Error("ALREADY_SUBMITTED");
        const used = (l.round.rerollsUsed ??= {});
        if ((used[id] ?? 0) >= (l.config.rerolls ?? 0))
          throw Error("REROLL_LIMIT");
        const choices = l.templatePool.filter(
          (templateId) => templateId !== l.round!.assignments[id],
        );
        if (!choices.length) throw Error("NO_ALTERNATIVE");
        l.round.assignments[id] =
          choices[Math.floor(Math.random() * choices.length)];
        used[id] = (used[id] ?? 0) + 1;
        this.event("TemplateChanged", now, { playerId: id });
        break;
      }
      case "draft":
        if (l.phase !== "INPUT" || !l.round) throw Error("WRONG_PHASE");
        if (l.round.submissions.some((s) => s.playerId === id))
          throw Error("ALREADY_SUBMITTED");
        l.round.drafts[id] = a.input;
        break;
      case "submit":
        if (l.phase !== "INPUT" || !l.round) throw Error("WRONG_PHASE");
        if (l.round.submissions.some((s) => s.playerId === id))
          throw Error("ALREADY_SUBMITTED");
        this.modes[l.config.mode].validateInput(a.input, l.round);
        l.round.submissions.push({
          id: randomUUID(),
          playerId: id,
          templateId: l.round.assignments[id],
          input: a.input,
        });
        this.event("SubmissionCreated", now, { playerId: id });
        // Do not make a complete group wait for a timer that no longer serves a purpose.
        if (this.hasAllRequiredSubmissions()) this.finish(now);
        break;
      case "vote": {
        if (l.phase !== "VOTING" || !l.round) throw Error("WRONG_PHASE");
        const s = l.round.submissions.find((s) => s.id === a.submissionId);
        if (!s) throw Error("NOT_FOUND");
        if (s.playerId === id) throw Error("SELF_VOTE");
        if (
          l.round.votes.some(
            (v) => v.playerId === id && v.submissionId === s.id,
          )
        )
          throw Error("ALREADY_VOTED");
        if (!this.mode().voting(l).validate(a.value, l.round))
          throw Error("INVALID_VOTE");
        l.round.votes.push({
          playerId: id,
          submissionId: s.id,
          value: a.value,
        });
        this.event("VoteCreated", now, { playerId: id });
        break;
      }
      case "buddy":
        if (l.phase !== "VOTING" || !l.round) throw Error("WRONG_PHASE");
        if (l.round.buddies[id]) throw Error("ALREADY_BUDDY");
        if (
          !l.round.submissions.some(
            (s) => s.id === a.submissionId && s.playerId !== id,
          )
        )
          throw Error("INVALID_BUDDY");
        l.round.buddies[id] = a.submissionId;
        break;
      case "chat":
        l.chat.push({
          id: randomUUID(),
          playerId: id,
          nickname: p.nickname,
          text: a.text,
          at: now,
        });
        l.chat = l.chat.slice(-50);
        break;
      case "kick":
        requireHost(l, id);
        if (a.playerId === id) throw Error("INVALID_TARGET");
        l.banned.push(a.playerId);
        l.players = l.players.filter((p) => p.id !== a.playerId);
        this.event("PlayerLeftLobby", now, { playerId: a.playerId });
        break;
    }
  }
  start(phase: Phase, now: number) {
    const l = this.lobby;
    l.phase = phase;
    l.phaseStart = now;
    const durations: Partial<Record<Phase, number>> = {
      PREPARING: 1000,
      ROUND_INTRO: 2500,
      INPUT: (l.round?.rule === "FAST" ? 30 : l.config.inputSeconds) * 1000,
      INPUT_LOCKED: 500,
      PRESENTATION: 3000,
      VOTING: l.config.voteSeconds * 1000,
      ROUND_RESULTS: l.config.hostNext ? 0 : 8000,
      NEXT_ROUND: 500,
      GAME_RESULTS: 12000,
    };
    l.phaseEnd = durations[phase] ? now + durations[phase]! : null;
    if (phase === "ROUND_INTRO") {
      l.round = this.modes[l.config.mode].setupRound(
        l,
        (l.round?.number ?? 0) + 1,
      );
      this.event("RoundStarted", now, { round: l.round.number });
    }
    if (phase === "ROUND_RESULTS") this.score(now);
    if (phase === "GAME_RESULTS") {
      this.mode().cleanupGame(l);
      this.event("GameFinished", now, {
        players: l.players.map((p) => ({ id: p.id, score: p.score })),
        mode: l.config.mode,
        config: l.config,
      });
    }
    this.mode().phases[phase]?.start?.({ lobby: l, now });
  }
  finish(now: number) {
    const l = this.lobby;
    this.mode().phases[l.phase]?.finish?.({ lobby: l, now });
    if (l.phase === "ROUND_RESULTS") {
      this.modes[l.config.mode].cleanupRound(l);
      this.start(
        (l.round?.number ?? 0) >= l.config.rounds
          ? "GAME_RESULTS"
          : "NEXT_ROUND",
        now,
      );
    } else {
      const n = after[l.phase];
      if (n) this.start(n, now);
    }
  }
  score(now: number) {
    const l = this.lobby;
    const r = l.round;
    if (!r || r.scored) return;
    r.scored = true;
    for (const s of r.submissions) {
      s.points =
        l.config.mode === "relaxed"
          ? 0
          : this.mode().scoring(l).score(r.votes, s.id) *
            r.multiplier;
      s.bonus = 0;
      const p = l.players.find((p) => p.id === s.playerId);
      if (p) p.score += s.points;
    }
    if (l.config.mode !== "relaxed")
      for (const [pid, sid] of Object.entries(r.buddies)) {
        const s = r.submissions.find((s) => s.id === sid);
        const p = l.players.find((p) => p.id === pid);
        if (s && p) {
          const bonus = Math.round((s.points ?? 0) * 0.25);
          p.score += bonus;
          const own = r.submissions.find((s) => s.playerId === pid);
          if (own) own.bonus = bonus;
        }
      }
    this.event("RoundFinished", now, { round: r.number });
  }
  update(now: number) {
    const l = this.lobby;
    this.mode().phases[l.phase]?.update?.({ lobby: l, now });
    const host = l.players.find((p) => p.id === l.hostId);
    if (
      !host?.connected &&
      (!host || now - (host.disconnectedAt ?? now) >= 15000)
    ) {
      const next = l.players.find((p) => p.connected);
      if (next) {
        l.hostId = next.id;
        this.event("HostChanged", now, { playerId: next.id });
      }
    }
    if (l.phaseEnd !== null && now >= l.phaseEnd) this.finish(now);
  }
  snapshot(id: string, now: number): Snapshot {
    const l = this.lobby;
    const r = l.round;
    const reveal = [
      "ROUND_RESULTS",
      "NEXT_ROUND",
      "GAME_RESULTS",
      "FINISHED",
    ].includes(l.phase);
    const presentation = ["PRESENTATION", "VOTING"].includes(l.phase) || reveal;
    return {
      code: l.code,
      name: l.name,
      hostId: l.hostId,
      config: l.config,
      players: l.players,
      phase: l.phase,
      phaseStart: l.phaseStart,
      phaseEnd: l.phaseEnd,
      serverTimestamp: now,
      revision: l.revision,
      roundNumber: r?.number ?? 0,
      topic: r?.topic ?? null,
      rule: r?.rule ?? null,
      templateId: r?.assignments[id] ?? null,
      myInput:
        r?.submissions.find((s) => s.playerId === id)?.input ??
        r?.drafts[id] ??
        null,
      rerollsRemaining: Math.max(
        0,
        (l.config.rerolls ?? 0) - (r?.rerollsUsed?.[id] ?? 0),
      ),
      submitted: !!r?.submissions.some((s) => s.playerId === id),
      submissions: presentation
        ? (r?.submissions ?? []).map((s) => ({
            own: s.playerId === id,
            id: s.id,
            templateId: s.templateId,
            input: s.input,
            ...(!l.config.anonymous || reveal ? { playerId: s.playerId } : {}),
            ...(reveal ? { points: s.points, bonus: s.bonus } : {}),
          }))
        : [],
      myVotes: Object.fromEntries(
        (r?.votes ?? [])
          .filter((v) => v.playerId === id)
          .map((v) => [v.submissionId, v.value]),
      ),
      myBuddy: r?.buddies[id] ?? null,
      chat: l.chat,
    };
  }
  private mode(): GameMode {
    const mode = this.modes[this.lobby.config.mode];
    if (!mode) throw Error("INVALID_MODE");
    return mode;
  }
  private hasAllRequiredSubmissions() {
    const round = this.lobby.round;
    const required = this.lobby.players.filter((player) => player.connected);
    return (
      !!round &&
      required.length > 0 &&
      required.every((player) =>
        round.submissions.some((submission) => submission.playerId === player.id),
      )
    );
  }
}
