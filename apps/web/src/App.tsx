import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { configSchema, type Config } from "@memeparty/shared";
import { init, action, leaveLobby, useGame, language } from "./store";
import { de, en, type Key } from "./i18n";
import { Editor } from "./Editor";
import { Meme } from "./Meme";
import { StartScreen } from "./StartScreen";
import { LobbyView } from "./LobbyView";
import { AdminPanel } from "./AdminPanel";
export function App() {
  const g = useGame();
  const t = (key: Key) => (g.language === "de" ? de : en)[key];
  const nav = useNavigate();
  const [config, setConfig] = useState<Config>(configSchema.parse({}));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [copied, setCopied] = useState(false);
  const [clock, setClock] = useState(Date.now());
  const [adminOpen, setAdminOpen] = useState(false);
  const s = g.state;
  const host = s?.hostId === g.id;
  useEffect(() => {
    void init().catch(() => useGame.setState({ error: "error" }));
    const timer = setInterval(() => setClock(Date.now()), 200);
    if ("serviceWorker" in navigator)
      void navigator.serviceWorker.register("/sw.js");
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    if (s) {
      nav(`/join/${s.code}`, { replace: true });
      setConfig(s.config);
    }
  }, [s?.code, JSON.stringify(s?.config), nav]);
  const perform = (fn: () => Promise<unknown>) => {
    setBusy(true);
    void fn()
      .catch((err) => {
        useGame.setState({
          error: err instanceof Error ? err.message : "error",
        });
      })
      .finally(() => setBusy(false));
  };
  const seconds =
    s?.phaseEnd === null || !s
      ? null
      : Math.max(0, Math.ceil((s.phaseEnd - clock - g.offset) / 1000));
  const playerName = (id: string | undefined) =>
    s?.players.find((p) => p.id === id)?.nickname ?? t("nameHidden");
  const revealAuthors = !!s && ["ROUND_RESULTS", "GAME_RESULTS", "FINISHED"].includes(s.phase);
  return (
    <>
      <header className="topbar">
        <a className="brand" href="/" aria-label={t("brand")}>
          <span className="brand-icon">
            M<span>✦</span>
          </span>
          <span>
            Meme<span className="brand-accent">Party</span>
          </span>
        </a>
        <div className="header-actions">
          {g.id && (
            <button className="secondary admin-open" onClick={() => setAdminOpen(true)}>
              {g.account?.role === "ADMIN" ? "Moderation" : "Admin"}
            </button>
          )}
          {g.id && (
            <span className="connection">
              <span className={g.connected ? "dot" : "dot amber"} />
              {t(g.connected ? "connected" : "connecting")}
            </span>
          )}
          <select
            aria-label={t("language")}
            value={g.language}
            onChange={(e) => language(e.target.value as "de" | "en")}
          >
            <option value="de">DE</option>
            <option value="en">EN</option>
          </select>
        </div>
      </header>
      <main>
        {g.error && (
          <div role="alert" className="alert">
            {t(g.error in de ? (g.error as Key) : "error")}
            <button
              aria-label="×"
              onClick={() => useGame.setState({ error: "" })}
            >
              ×
            </button>
          </div>
        )}
        {g.id && !g.connected && <div className="alert">{t("offline")}</div>}
        {!s ? (
          <StartScreen t={t} busy={busy} perform={perform} />
        ) : (
          <>
            <div className="game-heading">
              <div>
                <span className="eyebrow">
                  {s.phase === "LOBBY"
                    ? t(s.config.mode)
                    : `${t("round")} ${s.roundNumber} ${t("of")} ${s.config.rounds}`}
                </span>
                <h1>
                  {s.phase === "LOBBY"
                    ? s.name
                    : t(
                        (
                          {
                            INPUT: "input",
                            VOTING: "voting",
                            ROUND_RESULTS: "results",
                            GAME_RESULTS: "final",
                            FINISHED: "final",
                            PRESENTATION: "presentation",
                            INPUT_LOCKED: "locked",
                          } as Partial<Record<typeof s.phase, Key>>
                        )[s.phase] ?? "prepare",
                      )}
                </h1>
              </div>
              <div className="round-info">
                {s.phase === "LOBBY" ? (
                  <button
                    className="code-chip"
                    onClick={() => {
                      void navigator.clipboard
                        .writeText(`${window.location.origin}/join/${s.code}`)
                        .then(() => {
                          setCopied(true);
                          setTimeout(() => setCopied(false), 2000);
                        })
                        .catch(() => {});
                    }}
                    title={t("invite")}
                  >
                    {s.code} <small>{t(copied ? "copied" : "invite")}</small>
                  </button>
                ) : seconds !== null ? (
                  <div
                    className={`timer ${seconds <= 10 ? "urgent" : ""}`}
                    aria-label={t("timer")}
                  >
                    <b>{seconds}</b>
                    <small>{t("seconds")}</small>
                  </div>
                ) : null}
                {s.phase !== "LOBBY" && (
                  <button
                    className="text-button leave-lobby"
                    disabled={busy || !g.connected}
                    onClick={() =>
                      perform(() =>
                        leaveLobby().then(() => nav("/", { replace: true })),
                      )
                    }
                  >
                    {t("leaveLobby")}
                  </button>
                )}
              </div>
            </div>
            {s.phase === "LOBBY" ? (
              <LobbyView
                s={s}
                host={host}
                config={config}
                setConfig={setConfig}
                t={t}
                busy={busy}
                perform={perform}
              />
            ) : s.phase === "INPUT" ? (
              <>
                {s.topic && (
                  <div className="topic-banner">
                    {t("topicLabel")}: <strong>{s.topic}</strong>
                  </div>
                )}
                {s.rule && (
                  <div className="topic-banner">⚡ {t(s.rule as Key)}</div>
                )}
                <Editor key={`${s.code}-${s.roundNumber}`} />
              </>
            ) : [
                "PRESENTATION",
                "VOTING",
                "ROUND_RESULTS",
                "GAME_RESULTS",
                "FINISHED",
                "NEXT_ROUND",
              ].includes(s.phase) ? (
              <>
                {["GAME_RESULTS", "FINISHED"].includes(s.phase) && (
                  <section className="podium panel">
                    {s.config.mode === "relaxed" ? (
                      <h2>{t("noWinner")}</h2>
                    ) : (
                      <>
                        <span className="eyebrow">{t("winner")}</span>
                        <h2>
                          ✦{" "}
                          {
                            [...s.players].sort((a, b) => b.score - a.score)[0]
                              ?.nickname
                          }
                        </h2>
                      </>
                    )}
                    <div className="leaderboard">
                      {[...s.players]
                        .sort((a, b) => b.score - a.score)
                        .map((p, i) => (
                          <div key={p.id}>
                            <span>
                              {i + 1}. {p.nickname}
                            </span>
                            <b>
                              {p.score} <small>{t("score")}</small>
                            </b>
                          </div>
                        ))}
                    </div>
                    <p className="subtle">{t("finished")}</p>
                    {host ? (
                      <button
                        disabled={busy || !g.connected}
                        onClick={() =>
                          perform(() => action({ type: "restart" }))
                        }
                      >
                        {t("newGame")}
                      </button>
                    ) : (
                      <p className="subtle">{t("waiting")}</p>
                    )}
                  </section>
                )}
                {s.phase === "VOTING" && (
                  <p className="subtle">{t("voteDesc")}</p>
                )}
                {s.submissions.length === 0 ? (
                  <div className="panel">
                    <p>{t("empty")}</p>
                  </div>
                ) : (
                  <div className="submission-grid">
                    {s.submissions.map((sub) => {
                      const own = sub.own;
                      const voted = sub.id in s.myVotes;
                      return (
                        <article className="submission panel" key={sub.id}>
                          <Meme templateId={sub.templateId} input={sub.input} />
                          {revealAuthors && (
                            <div className="submission-meta">
                              <strong>{playerName(sub.playerId)}</strong>
                              {typeof sub.points === "number" && (
                                <b>
                                  {sub.points > 0 ? "+" : ""}
                                  {sub.points} <small>{t("score")}</small>
                                </b>
                              )}
                            </div>
                          )}
                          {typeof sub.bonus === "number" && sub.bonus !== 0 && (
                            <small>
                              {t("bonus")}: {sub.bonus > 0 ? "+" : ""}
                              {sub.bonus}
                            </small>
                          )}
                          {s.phase === "VOTING" &&
                            (own ? (
                              <div className="vote-status">{t("own")}</div>
                            ) : (
                              <>
                                <div className="vote-buttons">
                                  {(s.config.voting === "stars"
                                    ? [1, 2, 3, 4, 5]
                                    : s.config.voting === "positive"
                                      ? [1]
                                      : [-1, 0, 1]
                                  )
                                    .filter(
                                      (v) =>
                                        !(s.rule === "NO_DOWNVOTES" && v < 0),
                                    )
                                    .map((v) => (
                                      <button
                                        className={
                                          s.myVotes[sub.id] === v
                                            ? "selected secondary"
                                            : "secondary"
                                        }
                                        key={v}
                                        disabled={busy || voted || !g.connected}
                                        onClick={() =>
                                          perform(() =>
                                            action({
                                              type: "vote",
                                              submissionId: sub.id,
                                              value: v,
                                            }),
                                          )
                                        }
                                      >
                                        {s.config.voting === "stars"
                                          ? "★".repeat(v)
                                          : v === 1
                                            ? `♥ ${t("like")}`
                                            : v === 0
                                              ? `● ${t("neutral")}`
                                              : `− ${t("dislike")}`}
                                      </button>
                                    ))}
                                </div>
                                <button
                                  className="buddy-button"
                                  disabled={busy || !!s.myBuddy || !g.connected}
                                  onClick={() =>
                                    perform(() =>
                                      action({
                                        type: "buddy",
                                        submissionId: sub.id,
                                      }),
                                    )
                                  }
                                >
                                  ✦{" "}
                                  {t(
                                    s.myBuddy === sub.id
                                      ? "buddyChosen"
                                      : "buddy",
                                  )}
                                </button>
                              </>
                            ))}
                        </article>
                      );
                    })}
                  </div>
                )}
                {s.phase === "VOTING" && (
                  <p className="subtle small">{t("buddyDesc")}</p>
                )}
                {s.phase === "ROUND_RESULTS" && (
                  <div className="round-footer">
                    <div className="scores">
                      {[...s.players]
                        .sort((a, b) => b.score - a.score)
                        .map((p) => (
                          <span key={p.id}>
                            {p.nickname} <b>{p.score}</b>
                          </span>
                        ))}
                    </div>
                    {s.config.hostNext &&
                      (host ? (
                        <button
                          disabled={busy || !g.connected}
                          onClick={() =>
                            perform(() => action({ type: "next" }))
                          }
                        >
                          {t("next")}
                        </button>
                      ) : (
                        <p>{t("waiting")}</p>
                      ))}
                  </div>
                )}
              </>
            ) : (
              <section className="phase-wait panel">
                <div className="phase-spinner" />
                <h2>{t(s.phase === "INPUT_LOCKED" ? "locked" : "prepare")}</h2>
              </section>
            )}
            <section className="chat panel">
              <details open={s.phase === "LOBBY"}>
                <summary>
                  {t("chat")} <span>{s.chat.length}</span>
                </summary>
                <div className="chat-messages" aria-live="polite">
                  {s.chat.length ? (
                    s.chat.map((m) => (
                      <p key={m.id}>
                        <strong>{m.nickname}</strong> <span>{m.text}</span>
                      </p>
                    ))
                  ) : (
                    <p className="subtle">{t("emptyChat")}</p>
                  )}
                </div>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (message.trim())
                      perform(() =>
                        action({ type: "chat", text: message }).then(() =>
                          setMessage(""),
                        ),
                      );
                  }}
                >
                  <input
                    aria-label={t("message")}
                    placeholder={t("message")}
                    maxLength={300}
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                  />
                  <button
                    className="secondary"
                    disabled={!message.trim() || busy || !g.connected}
                  >
                    {t("send")}
                  </button>
                </form>
              </details>
            </section>
          </>
        )}
      </main>
      {adminOpen && <AdminPanel close={() => setAdminOpen(false)} />}
      <footer>
        <span>MemeParty</span>
        <span>✦ {t("playTogether")}</span>
      </footer>
    </>
  );
}
