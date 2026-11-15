import { TemplateSettings } from "./TemplateSettings";
import { TemplateBrowser } from "./TemplateBrowser";
import { useState } from "react";
import { useLocation } from "react-router-dom";
import { configSchema, type Config } from "@memeparty/shared";
import { signIn, createLobby, joinLobby, useGame } from "./store";
import { Meme } from "./Meme";
import type { Key } from "./i18n";
import type { UIActions } from "./ui-types";
export function StartScreen({ t, busy, perform }: UIActions) {
  const g = useGame();
  const location = useLocation();
  const [nickname, setNickname] = useState("");
  const [name, setName] = useState(t("defaultLobby"));
  const [code, setCode] = useState(
    location.pathname.startsWith("/join/")
      ? location.pathname.split("/")[2]
      : "",
  );
  const inviteToken = new URLSearchParams(location.search).get("invite") ?? undefined;
  const [tab, setTab] = useState<"create" | "join">(code ? "join" : "create");
  const [config, setConfig] = useState<Config>(configSchema.parse({}));
  const modeKeys = ["normal", "same", "topic", "relaxed", "chaos"] as const;
  return (
    <div className="start-layout">
      <section className="start-art">
        <div className="eyebrow">{t("partyLabel")}</div>
        <h1>
          {t("heroTop")}
          <br />
          <span>{t("heroBottom")}</span>
        </h1>
        <p>{t("tag")}</p>
        <div className="art-meme">
          <Meme
            templateId="deadline"
            input={{
              layers: [
                {
                  text: t("sampleTop"),
                  x: 5,
                  y: 6,
                  width: 90,
                  size: 30,
                  font: "impact",
                  color: "#ffffff",
                  outline: 2,
                  rotation: 0,
                  uppercase: true,
                  align: "center",
                },
                {
                  text: t("sampleBottom"),
                  x: 5,
                  y: 78,
                  width: 90,
                  size: 30,
                  font: "impact",
                  color: "#ffffff",
                  outline: 2,
                  rotation: 0,
                  uppercase: true,
                  align: "center",
                },
              ],
            }}
          />
          <span className="art-badge">+100</span>
        </div>
      </section>
      <section className="panel start-panel">
        {!g.id ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              perform(() => signIn(nickname));
            }}
          >
            <span className="eyebrow">01 / {t("nickname")}</span>
            <h2>{t("enter")}</h2>
            <label>
              {t("nickname")}
              <input
                required
                minLength={2}
                maxLength={24}
                autoComplete="nickname"
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                placeholder="PixelPilot"
              />
            </label>
            <button disabled={busy}>{t("enter")}</button>
          </form>
        ) : (
          <>
            <div className="profile">
              <span className="avatar">{g.nickname[0]?.toUpperCase()}</span>
              <span>
                <small>{t("yourName")}</small>
                <strong>{g.nickname}</strong>
              </span>
            </div>
            <div className="tabs">
              <button
                className={tab === "create" ? "active" : ""}
                onClick={() => setTab("create")}
              >
                {t("create")}
              </button>
              <button
                className={tab === "join" ? "active" : ""}
                onClick={() => setTab("join")}
              >
                {t("join")}
              </button>
            </div>
            {tab === "create" ? (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  perform(() => createLobby(name, config));
                }}
              >
                <h2>{t("choose")}</h2>
                <label>
                  {t("lobbyName")}
                  <input
                    required
                    maxLength={48}
                    minLength={2}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </label>
                <div className="mode-list">
                  {modeKeys.map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      className={
                        config.mode === mode
                          ? "mode-card selected"
                          : "mode-card"
                      }
                      onClick={() => setConfig({ ...config, mode })}
                    >
                      <span className="mode-symbol">
                        {
                          {
                            normal: "✦",
                            same: "＝",
                            topic: "#",
                            relaxed: "☕",
                            chaos: "⚡",
                          }[mode]
                        }
                      </span>
                      <span>
                        <strong>{t(mode)}</strong>
                        <small>{t(`${mode}Desc` as Key)}</small>
                      </span>
                      <span className="radio" />
                    </button>
                  ))}
                </div>
                <TemplateSettings config={config} onChange={setConfig} />
                <TemplateBrowser config={config} />
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
                <button disabled={busy || !g.connected}>{t("create")}</button>
              </form>
            ) : (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  perform(() => joinLobby(code.toUpperCase(), inviteToken));
                }}
              >
                <h2>{t("join")}</h2>
                <p className="subtle">{t("joinHint")}</p>
                <label>
                  {t("code")}
                  <input
                    className="code-input"
                    required
                    minLength={6}
                    maxLength={6}
                    value={code}
                    onChange={(e) =>
                      setCode(
                        e.target.value.toUpperCase().replace(/[^A-Z2-9]/g, ""),
                      )
                    }
                    placeholder="X7K4P2"
                  />
                </label>
                <button disabled={busy || !g.connected}>{t("join")}</button>
              </form>
            )}
          </>
        )}
      </section>
    </div>
  );
}
