import { randomUUID } from "node:crypto";
import {
  inputSchema,
  availableTemplates,
  type Input,
  type Lobby,
  type Phase,
  type Round,
  type Vote,
} from "@memeparty/shared";
export interface VotingStrategy {
  validate(value: number, round: Round): boolean;
}
export interface ScoringStrategy {
  score(votes: Vote[], submissionId: string): number;
}
export interface PhaseContext {
  lobby: Lobby;
  now: number;
}
/**
 * A mode can opt into a lifecycle hook without teaching the engine about the
 * mode's payload, rules or assets. Hooks deliberately receive the persisted
 * lobby only; network transport remains the server's responsibility.
 */
export interface PhaseHooks {
  start?(context: PhaseContext): void;
  update?(context: PhaseContext): void;
  validateAction?(context: PhaseContext): void;
  finish?(context: PhaseContext): void;
  onPlayerJoin?(context: PhaseContext & { playerId: string }): void;
  onPlayerLeave?(context: PhaseContext & { playerId: string }): void;
  onReconnect?(context: PhaseContext & { playerId: string }): void;
}
export const likeDislike: ScoringStrategy = {
  score: (votes, id) =>
    votes
      .filter((v) => v.submissionId === id)
      .reduce((a, v) => a + v.value, 0) * 100,
};
export const positive: ScoringStrategy = {
  score: (votes, id) =>
    votes.filter((v) => v.submissionId === id && v.value > 0).length * 100,
};
export const stars: ScoringStrategy = {
  score: (votes, id) => {
    const values = votes
      .filter((v) => v.submissionId === id)
      .map((v) => v.value);
    return values.length
      ? Math.round(
          (values.reduce((total, value) => total + value, 0) / values.length) *
            100,
        )
      : 0;
  },
};
export interface GameMode {
  id: string;
  name: string;
  description: string;
  minPlayers: number;
  maxPlayers: number;
  supportedPhases: readonly Phase[];
  /** Mode-owned hooks allow non-meme modes to extend a phase safely. */
  phases: Partial<Record<Phase, PhaseHooks>>;
  inputSchema: typeof inputSchema;
  voting(lobby: Lobby): VotingStrategy;
  scoring(lobby: Lobby): ScoringStrategy;
  setupGame(lobby: Lobby): void;
  setupRound(lobby: Lobby, number: number): Round;
  cleanupRound(lobby: Lobby): void;
  cleanupGame(lobby: Lobby): void;
  validateInput(input: Input, round: Round): void;
}
const topics = [
  "Montagmorgen",
  "Wenn das WLAN ausfällt",
  "Der letzte Arbeitstag",
  "Ein völlig normaler Spieleabend",
  "Wenn der Plan funktioniert",
];
const playablePhases: Phase[] = [
  "LOBBY",
  "PREPARING",
  "ROUND_INTRO",
  "INPUT",
  "INPUT_LOCKED",
  "PRESENTATION",
  "VOTING",
  "ROUND_RESULTS",
  "NEXT_ROUND",
  "GAME_RESULTS",
  "FINISHED",
];
function mode(id: string, name: string, description: string): GameMode {
  return {
    id,
    name,
    description,
    minPlayers: 2,
    maxPlayers: 12,
    supportedPhases: playablePhases,
    phases: {},
    inputSchema,
    voting: (lobby) => ({
      validate: (v, r) => {
        if (lobby.config.voting === "stars") return v >= 1 && v <= 5;
        if (lobby.config.voting === "positive") return v === 1;
        return [-1, 0, 1].includes(v) && (!r.noDownvotes || v >= 0);
      },
    }),
    scoring: (lobby) =>
      lobby.config.voting === "stars"
        ? stars
        : lobby.config.voting === "positive"
          ? positive
          : likeDislike,
    setupGame: () => {},
    cleanupRound: () => {},
    cleanupGame: () => {},
    validateInput: (input, r) => {
      if (!input.layers.some((l) => l.text.trim())) throw Error("EMPTY_INPUT");
      if (
        r.rule === "SHORT_TEXT" &&
        input.layers.some((l) => l.text.length > 40)
      )
        throw Error("TEXT_TOO_LONG");
    },
    setupRound: (l, n) => {
      const ids = l.templatePool?.length
        ? l.templatePool
        : availableTemplates(l.config).map((t) => t.id);
      const shuffled = [...ids].sort(() => Math.random() - 0.5);
      const same = id !== "normal";
      const chaos = id === "chaos";
      const rule = chaos
        ? ["DOUBLE_POINTS", "NO_DOWNVOTES", "SHORT_TEXT", "FAST"][
            Math.floor(Math.random() * 4)
          ]
        : null;
      return {
        number: n,
        topic:
          id === "topic"
            ? topics[Math.floor(Math.random() * topics.length)]
            : null,
        rule,
        multiplier: rule === "DOUBLE_POINTS" ? 2 : 1,
        noDownvotes: rule === "NO_DOWNVOTES",
        rerollsUsed: {},
        drafts: {},
        assignments: Object.fromEntries(
          l.players.map((p, i) => [
            p.id,
            same ? shuffled[0] : shuffled[i % shuffled.length],
          ]),
        ),
        submissions: [],
        votes: [],
        buddies: {},
        scored: false,
      };
    },
  };
}
export const modes: Record<string, GameMode> = Object.fromEntries(
  [
    ["normal", "Meme Battle", "Different template for every player."],
    ["same", "Same Meme", "One template, many punchlines."],
    ["topic", "Themen-Meme", "A shared topic shapes every entry."],
    ["relaxed", "Entspannt", "A score-free creative round."],
    ["chaos", "Chaos", "A random rule changes each round."],
  ].map(([id, name, description]) => [id, mode(id, name, description)]),
);
export function createSubmissionId() {
  return randomUUID();
}
