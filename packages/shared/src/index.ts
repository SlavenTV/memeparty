import { z } from "zod";
export const phases = [
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
] as const;
export type Phase = (typeof phases)[number];
export const categoryIds = [
  "classic",
  "reactions",
  "animals",
  "comics",
  "work",
  "gaming",
  "movies",
  "school",
  "tech",
  "sports",
  "wholesome",
  "originals",
] as const;
export type Category = (typeof categoryIds)[number];
/** A generous server-validated ceiling; every lobby chooses its own value. */
export const MAX_REROLLS_PER_ROUND = 100;
export const configSchema = z.object({
  mode: z.enum(["normal", "same", "topic", "relaxed", "chaos"]).default("same"),
  voting: z.enum(["reaction", "positive", "stars"]).default("reaction"),
  streamerMode: z.boolean().default(false),
  rerolls: z.number().int().min(0).max(MAX_REROLLS_PER_ROUND).default(2),
  categories: z
    .array(z.enum(categoryIds))
    .min(1)
    .max(categoryIds.length)
    .default(["classic", "reactions", "animals", "comics", "work"]),
  rounds: z.number().int().min(1).max(10).default(3),
  inputSeconds: z.number().int().min(10).max(300).default(60),
  voteSeconds: z.number().int().min(10).max(120).default(30),
  maxPlayers: z.number().int().min(2).max(12).default(8),
  anonymous: z.boolean().default(true),
  public: z.boolean().default(false),
  family: z.boolean().default(true),
  hostNext: z.boolean().default(false),
});
export type Config = z.infer<typeof configSchema>;
export const nicknameSchema = z
  .string()
  .trim()
  .min(2)
  .max(24)
  .regex(/^[\p{L}\p{N} _.-]+$/u);
export const fontIds = [
  "impact",
  "arial-black",
  "comic",
  "georgia",
  "courier",
  "trebuchet",
  "times",
  "system",
] as const;
export type FontId = (typeof fontIds)[number];
export const layerSchema = z.object({
  text: z.string().max(180),
  x: z.number().min(0).max(100),
  y: z.number().min(0).max(90),
  width: z.number().min(20).max(100),
  size: z.number().min(12).max(120),
  font: z.enum(fontIds).default("impact"),
  color: z.string().regex(/^#[a-fA-F0-9]{6}$/),
  outline: z.number().min(0).max(5),
  rotation: z.number().min(-180).max(180),
  uppercase: z.boolean(),
  align: z.enum(["left", "center", "right"]),
});
export const inputSchema = z.object({
  layers: z.array(layerSchema).min(1).max(4),
});
export type Input = z.infer<typeof inputSchema>;
export const actionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("ready"), ready: z.boolean() }),
  z.object({ type: z.literal("start") }),
  z.object({ type: z.literal("next") }),
  z.object({ type: z.literal("restart") }),
  z.object({ type: z.literal("config"), config: configSchema }),
  z.object({ type: z.literal("reroll") }),
  z.object({ type: z.literal("draft"), input: inputSchema }),
  z.object({ type: z.literal("submit"), input: inputSchema }),
  z.object({
    type: z.literal("vote"),
    submissionId: z.string().uuid(),
    value: z.number().int().min(-1).max(5),
  }),
  z.object({ type: z.literal("buddy"), submissionId: z.string().uuid() }),
  z.object({
    type: z.literal("chat"),
    text: z.string().trim().min(1).max(300),
  }),
  z.object({ type: z.literal("kick"), playerId: z.string().uuid() }),
]);
export type Action = z.infer<typeof actionSchema>;
export interface Player {
  id: string;
  nickname: string;
  ready: boolean;
  connected: boolean;
  connectedAt: number;
  disconnectedAt: number | null;
  score: number;
}
export interface Template {
  id: string;
  name: string;
  url: string;
  categories: Category[];
  source?: string;
  aspectRatio?: number;
}
export interface Submission {
  id: string;
  playerId: string;
  templateId: string;
  input: Input;
  points?: number;
  bonus?: number;
}
export interface Vote {
  playerId: string;
  submissionId: string;
  value: number;
}
export interface Round {
  number: number;
  topic: string | null;
  rule: string | null;
  multiplier: number;
  noDownvotes: boolean;
  rerollsUsed: Record<string, number>;
  drafts: Record<string, Input>;
  assignments: Record<string, string>;
  submissions: Submission[];
  votes: Vote[];
  buddies: Record<string, string>;
  scored: boolean;
}
export interface Invite {
  expiresAt: number;
  uses: number;
  maxUses: number;
}
export interface Lobby {
  code: string;
  name: string;
  hostId: string;
  config: Config;
  /** Server-selected IDs from the database catalogue for these lobby rules. */
  templatePool: string[];
  players: Player[];
  phase: Phase;
  phaseStart: number;
  phaseEnd: number | null;
  round: Round | null;
  revision: number;
  chat: {
    id: string;
    playerId: string;
    nickname: string;
    text: string;
    at: number;
  }[];
  banned: string[];
  invites: Record<string, Invite>;
  gameId: string;
  createdAt: number;
}
export interface PublicSubmission {
  own: boolean;
  id: string;
  templateId: string;
  input: Input;
  playerId?: string;
  points?: number;
  bonus?: number;
}
export interface Snapshot {
  code: string;
  name: string;
  hostId: string;
  config: Config;
  players: Player[];
  phase: Phase;
  phaseStart: number;
  phaseEnd: number | null;
  serverTimestamp: number;
  revision: number;
  roundNumber: number;
  topic: string | null;
  rule: string | null;
  templateId: string | null;
  myInput: Input | null;
  rerollsRemaining: number;
  submitted: boolean;
  submissions: PublicSubmission[];
  myVotes: Record<string, number>;
  myBuddy: string | null;
  chat: Lobby["chat"];
}
export type Reply<T = undefined> =
  | { ok: true; data: T }
  | { ok: false; error: string };
export interface ClientEvents {
  "lobby:create": (
    payload: { name: string; config: Config },
    ack: (r: Reply<{ code: string }>) => void,
  ) => void;
  "lobby:join": (
    payload: { code: string; inviteToken?: string },
    ack: (r: Reply<{ code: string }>) => void,
  ) => void;
  "lobby:restore": (ack: (r: Reply<{ code: string } | null>) => void) => void;
  "lobby:leave": (ack: (r: Reply) => void) => void;
  "lobby:create-invite": (ack: (r: Reply<{ token: string }>) => void) => void;
  "game:action": (payload: Action, ack: (r: Reply) => void) => void;
}
export interface ServerEvents {
  "lobby:state": (state: Snapshot) => void;
  "lobby:kicked": () => void;
}
export const templates: Template[] = [
  {
    id: "deadline",
    name: "Deadline-Energie",
    url: "/templates/deadline.webp",
    categories: ["originals", "work"],
  },
  {
    id: "plan",
    name: "Der perfekte Plan",
    url: "/templates/plan.webp",
    categories: ["originals", "work"],
  },
  {
    id: "weekend",
    name: "Wochenendmodus",
    url: "/templates/weekend.webp",
    categories: ["originals"],
  },
  ...(
    [
      [
        "181913649",
        "Drake Hotline Bling",
        "30b1gx.jpg",
        1,
        ["classic", "reactions"],
      ],
      [
        "87743020",
        "Two Buttons",
        "1g8my4.jpg",
        600 / 908,
        ["classic", "comics"],
      ],
      [
        "112126428",
        "Distracted Boyfriend",
        "1ur9b0.jpg",
        1.5,
        ["classic", "reactions"],
      ],
      [
        "97984",
        "Disaster Girl",
        "23ls.jpg",
        500 / 375,
        ["classic", "reactions"],
      ],
      ["129242436", "Change My Mind", "24y43o.jpg", 482 / 361, ["classic"]],
      [
        "61579",
        "One Does Not Simply",
        "1bij.jpg",
        568 / 335,
        ["classic", "reactions"],
      ],
      [
        "188390779",
        "Woman Yelling At Cat",
        "345v97.jpg",
        680 / 438,
        ["animals", "reactions"],
      ],
      [
        "247375501",
        "Buff Doge vs. Cheems",
        "43a45p.png",
        937 / 720,
        ["animals", "classic"],
      ],
      [
        "148909805",
        "Monkey Puppet",
        "2gnnjh.jpg",
        923 / 768,
        ["animals", "reactions"],
      ],
      [
        "55311130",
        "This Is Fine",
        "wxica.jpg",
        580 / 282,
        ["comics", "animals", "work"],
      ],
      ["131940431", "Gru's Plan", "26jxvz.jpg", 700 / 449, ["comics", "work"]],
      [
        "102156234",
        "Mocking Spongebob",
        "1otk96.jpg",
        502 / 353,
        ["comics", "reactions"],
      ],
      [
        "155067746",
        "Surprised Pikachu",
        "2kbn1e.jpg",
        1,
        ["comics", "reactions"],
      ],
      ["61520", "Futurama Fry", "1bgw.jpg", 552 / 414, ["comics", "classic"]],
      [
        "1035805",
        "Boardroom Meeting Suggestion",
        "m78d.jpg",
        500 / 649,
        ["work", "comics"],
      ],
      [
        "27813981",
        "Hide the Pain Harold",
        "gk5el.jpg",
        480 / 601,
        ["work", "reactions"],
      ],
      [
        "177682295",
        "You Guys are Getting Paid",
        "2xscjb.png",
        520 / 358,
        ["work", "reactions"],
      ],
      [
        "180190441",
        "They're The Same Picture",
        "2za3u1.jpg",
        1363 / 1524,
        ["work", "reactions"],
      ],
      ["217743513", "UNO Draw 25 Cards", "3lmzyx.jpg", 500 / 494, ["classic", "reactions"]],
      ["124822590", "Left Exit 12 Off Ramp", "22bdq6.jpg", 804 / 767, ["work", "reactions"]],
      ["252600902", "Always Has Been", "46e43q.png", 960 / 540, ["classic", "reactions"]],
      ["135256802", "Epic Handshake", "28j0te.jpg", 900 / 645, ["classic", "work"]],
      ["131087935", "Running Away Balloon", "261o3j.jpg", 761 / 1024, ["reactions", "work"]],
      ["4087833", "Waiting Skeleton", "2fm6x.jpg", 298 / 403, ["classic", "work"]],
      ["309868304", "Trade Offer", "54hjww.jpg", 607 / 794, ["reactions", "work"]],
      ["124055727", "Y'all Got Any More Of That", "21uy0f.jpg", 600 / 471, ["reactions", "comics"]],
      ["91538330", "X, X Everywhere", "1ihzfe.jpg", 2118 / 1440, ["classic", "comics"]],
      ["438680", "Batman Slapping Robin", "9ehk.jpg", 400 / 387, ["comics", "reactions"]],
      ["79132341", "Bike Fall", "1b42wl.jpg", 500 / 680, ["classic", "reactions"]],
      ["161865971", "Marked Safe From", "2odckz.jpg", 618 / 499, ["work", "reactions"]],
      ["100777631", "Is This A Pigeon", "1o00in.jpg", 1587 / 1425, ["comics", "reactions"]],
      ["93895088", "Expanding Brain", "1jwhww.jpg", 857 / 1202, ["comics", "work"]],
      ["178591752", "Tuxedo Winnie The Pooh", "2ybua0.png", 800 / 582, ["comics", "reactions"]],
      ["195515965", "Clown Applying Makeup", "38el31.jpg", 750 / 798, ["reactions", "work"]],
      ["206151308", "Spider Man Triple", "3eqjd8.jpg", 600 / 551, ["comics", "reactions"]],
      ["89370399", "Roll Safe Think About It", "1h7in3.jpg", 702 / 395, ["classic", "reactions"]],
      ["84341851", "Evil Kermit", "1e7ql7.jpg", 700 / 325, ["comics", "reactions"]],
      ["309668311", "Two Paths", "54d9lj.png", 1, ["work", "classic"]],
      ["322841258", "Anakin Padme 4 Panel", "5c7lwq.png", 1, ["comics", "reactions"]],
      ["80707627", "Sad Pablo Escobar", "1c1uej.jpg", 720 / 709, ["classic", "reactions"]],
      ["101470", "Ancient Aliens", "26am.jpg", 500 / 437, ["classic", "reactions"]],
      ["505705955", "Absolute Cinema", "8d317n.png", 936 / 725, ["reactions", "comics"]],
      ["67452763", "Squidward Window", "145qvv.jpg", 598 / 420, ["comics", "reactions"]],
      ["28251713", "Oprah You Get A", "gtj5t.jpg", 620 / 465, ["classic", "reactions"]],
      ["3218037", "Trophy If I Had One", "1wz1x.jpg", 300 / 418, ["comics", "reactions"]],
      ["370867422", "Megamind Peeking", "64sz4u.png", 1, ["comics", "reactions"]],
      ["77045868", "Pawn Stars Best I Can Do", "19vcz0.jpg", 624 / 352, ["classic", "work"]],
      ["533936279", "Bell Curve", "8tw3vb.png", 675 / 499, ["work", "classic"]],
      ["284929871", "They Don't Know", "4pn1an.png", 1, ["reactions", "classic"]],
      ["137501417", "Friendship Ended", "29v4rt.jpg", 800 / 600, ["classic", "reactions"]],
      ["354700819", "Two Guys On A Bus", "5v6gwj.jpg", 762 / 675, ["reactions", "work"]],
      ["163573", "Imagination Spongebob", "3i7p.jpg", 500 / 366, ["comics", "reactions"]],
      ["166969924", "Flex Tape", "2reqtg.png", 510 / 572, ["classic", "work"]],
      ["259237855", "Laughing Leo", "4acd7j.png", 1, ["reactions", "classic"]],
      ["99683372", "Sleeping Shaq", "1nck6k.jpg", 640 / 631, ["reactions", "classic"]],
      ["187102311", "Three-Headed Dragon", "33e92f.jpg", 680 / 544, ["comics", "classic"]],
      ["145139900", "Scooby-Doo Mask Reveal", "2eeunw.jpg", 720 / 960, ["comics", "reactions"]],
      ["226297822", "Panik Kalm Panik", "3qqcim.png", 640 / 881, ["reactions", "comics"]],
      ["110133729", "Spider-Man Pointing", "1tkjq9.jpg", 800 / 450, ["comics", "reactions"]],
      ["162372564", "Domino Effect", "2oo7h0.jpg", 820 / 565, ["work", "classic"]],
      ["61585", "Bad Luck Brian", "1bip.jpg", 475 / 562, ["classic", "reactions"]],
      ["104893621", "Grim Reaper Knocking", "1qg8fp.jpg", 500 / 312, ["classic", "comics"]],
      ["61556", "Grandma Finds The Internet", "1bhw.jpg", 640 / 480, ["classic", "work"]],
      ["29562797", "I'm The Captain Now", "hlmst.jpg", 478 / 350, ["classic", "reactions"]],
      ["134797956", "American Chopper Argument", "2896ro.jpg", 640 / 1800, ["work", "reactions"]],
      ["92084495", "Charlie Conspiracy", "1itoun.jpg", 1024 / 768, ["comics", "reactions"]],
      ["5496396", "Leonardo DiCaprio Cheers", "39t1o.jpg", 600 / 400, ["classic", "reactions"]],
      ["47169131", "Wolverine Remember", "s2zxn.jpg", 480 / 700, ["comics", "reactions"]],
      ["123999232", "The Scroll Of Truth", "21tqf4.jpg", 1280 / 1236, ["comics", "reactions"]],
      ["342785297", "Gus Fring: Not The Same", "5o32tt.png", 700 / 1000, ["reactions", "work"]],
    ] satisfies [string, string, string, number, Category[]][]
  ).map(([id, name, image, aspectRatio, categories]) => ({
    id: `imgflip-${id}`,
    name,
    url: `https://i.imgflip.com/${image}`,
    aspectRatio,
    categories,
    source: `https://imgflip.com/memegenerator/${id}`,
  })),
];
export function availableTemplates(config: Pick<Config, "categories">) {
  return templates.filter((t) =>
    t.categories.some((c) => (config.categories ?? categoryIds).includes(c)),
  );
}
