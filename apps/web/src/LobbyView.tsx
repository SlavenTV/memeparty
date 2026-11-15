import { TemplateSettings } from "./TemplateSettings";
import { useState, type Dispatch, type SetStateAction } from "react";
import { useNavigate } from "react-router-dom";
import type { Config, Snapshot } from "@memeparty/shared";
import { action, createInviteLink, leaveLobby, useGame } from "./store";
import type { UIActions } from "./ui-types";
export function LobbyView({
  s,
  host,
  config,
  setConfig,
  t,
  busy,
  perform,
}: UIActions & {
  s: Snapshot;
  host: boolean;
  config: Config;
  setConfig: Dispatch<SetStateAction<Config>>;
}) {
  const g = useGame();
  const navigate = useNavigate();
  const [inviteCopied, setInviteCopied] = useState(false);
  const modeKeys = ["normal", "same", "topic", "relaxed", "chaos"] as const;
  return (
    <div className="lobby-grid">
      <section className="panel">
        <div className="section-heading">
          <h2>{t("players")}</h2>
          <span>
            {s.players.length}/{s.config.maxPlayers}
          </span>
        </div>
        <p className="subtle">{t("lobbyHint")}</p>
        <div className="player-list">
          {s.players.map((p, i) => (
            <div className="player" key={p.id}>
              <span className={`avatar hue-${i % 4}`}>
                {p.nickname[0].toUpperCase()}
              </span>
              <div className="player-info">
                <strong>
                  {p.nickname}
                  {p.id === g.id && <small> · {t("me")}</small>}
                </strong>
                <span>
                  {p.id === s.hostId
                    ? t("host")
                    : t(
                        p.connected
                          ? p.ready
                            ? "ready"
                            : "notReady"
                          : "playerWaiting",
                      )}
                </span>
              </div>
              <span
                className={p.ready ? "ready-indicator yes" : "ready-indicator"}
              >
                {p.ready ? "✓" : "○"}
              </span>
              {host && p.id !== g.id && (
                <button
                  className="kick"
                  title={t("kick")}
                  onClick={() => {
                    if (confirm(t("kickConfirm")))
                      perform(() => action({ type: "kick", playerId: p.id }));
                  }}
                >
                  ×
                </button>
              )}
            </div>
          ))}
        </div>
        <div className="lobby-actions">
          <button
            className="secondary"
            disabled={busy || !g.connected}
            onClick={() =>
              perform(() =>
                action({
                  type: "ready",
                  ready: !s.players.find((p) => p.id === g.id)?.ready,
                }),
              )
            }
          >
            {t(
              s.players.find((p) => p.id === g.id)?.ready
                ? "notReady"
                : "ready",
            )}
          </button>
          {host && (
            <button
              disabled={
                busy ||
                !g.connected ||
                s.players.length < 2 ||
                s.players.some((p) => !p.connected || !p.ready)
              }
              onClick={() => perform(() => action({ type: "start" }))}
            >
              {t("start")}
            </button>
          )}
        </div>
        <p className="subtle small">{t("startHint")}</p>
        {host && s.config.streamerMode && (
          <button
            className="secondary"
            disabled={busy || !g.connected}
            onClick={() =>
              perform(() =>
                createInviteLink().then(({ token }) =>
                  navigator.clipboard
                    .writeText(`${window.location.origin}/join/${s.code}?invite=${token}`)
                    .then(() => {
                      setInviteCopied(true);
                      setTimeout(() => setInviteCopied(false), 2000);
                    }),
                ),
              )
            }
          >
            {t(inviteCopied ? "copied" : "newInvite")}
          </button>
        )}
        <button
          className="text-button leave-lobby"
          disabled={busy || !g.connected}
          onClick={() =>
            perform(() => leaveLobby().then(() => navigate("/", { replace: true })))
          }
        >
          {t("leaveLobby")}
        </button>
      </section>
      <section className="panel">
        <h2>{t("settings")}</h2>
        <fieldset disabled={!host || busy}>
          <label>
            {t("mode")}
            <select
              value={config.mode}
              onChange={(e) =>
                setConfig({
                  ...config,
                  mode: e.target.value as Config["mode"],
                })
              }
            >
              {modeKeys.map((m) => (
                <option value={m} key={m}>
                  {t(m)}
                </option>
              ))}
            </select>
          </label>
          <div className="form-row">
            {(["rounds", "inputSeconds", "voteSeconds"] as const).map((f) => (
              <label key={f}>
                {t(
                  f === "rounds"
                    ? "rounds"
                    : f === "inputSeconds"
                      ? "inputTime"
                      : "voteTime",
                )}
                <input
                  type="number"
                  min={f === "rounds" ? 1 : 10}
                  max={f === "rounds" ? 10 : f === "inputSeconds" ? 300 : 120}
                  value={config[f]}
                  onChange={(e) =>
                    setConfig({
                      ...config,
                      [f]: Number(e.target.value),
                    })
                  }
                />
              </label>
            ))}
          </div>
          <label>
            {t("votingLabel")}
            <select
              value={config.voting}
              onChange={(e) =>
                setConfig({
                  ...config,
                  voting: e.target.value as Config["voting"],
                })
              }
            >
              <option value="reaction">{t("reactionVoting")}</option>
              <option value="positive">{t("positiveVoting")}</option>
              <option value="stars">{t("starVoting")}</option>
            </select>
          </label>
          <TemplateSettings config={config} onChange={setConfig} />
          <label className="check">
            <input
              type="checkbox"
              checked={config.anonymous}
              onChange={(e) =>
                setConfig({ ...config, anonymous: e.target.checked })
              }
            />
            {t("anonymous")}
          </label>
          <label className="check">
            <input
              type="checkbox"
              checked={config.hostNext}
              onChange={(e) =>
                setConfig({ ...config, hostNext: e.target.checked })
              }
            />
            {t("hostNext")}
          </label>
          <label className="check">
            <input
              type="checkbox"
              checked={config.family}
              onChange={(e) =>
                setConfig({ ...config, family: e.target.checked })
              }
            />
            {t("familyMode")}
          </label>
          <label className="check">
            <input
              type="checkbox"
              checked={config.streamerMode}
              onChange={(e) =>
                setConfig({ ...config, streamerMode: e.target.checked })
              }
            />
            {t("streamerMode")}
          </label>
          {host && (
            <button
              className="secondary"
              onClick={() => perform(() => action({ type: "config", config }))}
            >
              {t("save")}
            </button>
          )}
        </fieldset>
      </section>
    </div>
  );
}
