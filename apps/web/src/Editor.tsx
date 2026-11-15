import { useEffect, useState } from "react";
import { fontIds, inputSchema, type FontId, type Input } from "@memeparty/shared";
import { Meme } from "./Meme";
import { action, useGame } from "./store";
import { de, en, type Key } from "./i18n";
const layer = (y: number): Input["layers"][number] => ({
  text: "",
  x: 15,
  y,
  width: 70,
  size: 32,
  font: "impact",
  color: "#ffffff",
  outline: 2,
  rotation: 0,
  uppercase: true,
  align: "center",
});
export function Editor() {
  const { state: s, language: lang, connected } = useGame();
  const t = (k: Key) => (lang === "de" ? de : en)[k];
  const [input, setInput] = useState<Input>(
    s?.myInput ?? { layers: [layer(6), layer(75)] },
  );
  const [selected, setSelected] = useState(0);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!s || s.submitted || !connected) return;
    const timer = setTimeout(() => {
      void action({ type: "draft", input }).catch(() => {});
    }, 700);
    return () => clearTimeout(timer);
  }, [input, connected, s?.submitted]);
  if (!s) return null;
  function update(i: number, patch: Partial<Input["layers"][number]>) {
    setInput((old) => ({
      layers: old.layers.map((l, j) => (j === i ? { ...l, ...patch } : l)),
    }));
  }
  return (
    <div className="editor-grid">
      <section>
        <Meme
          templateId={s.templateId!}
          input={s.submitted ? (s.myInput ?? input) : input}
          onUpdate={s.submitted || !connected ? undefined : update}
          selected={selected}
          onSelect={setSelected}
          language={lang}
          maxLength={s.rule === "SHORT_TEXT" ? 40 : 180}
        />
        {!s.submitted && (
          <>
            <p className="subtle">
              {lang === "de"
                ? "Text ziehen · Doppelklick zum Bearbeiten · ↔ Größe · ↻ Drehen"
                : "Drag text · Double-click to edit · ↔ Resize · ↻ Rotate"}
            </p>
            <button
              className="secondary"
              disabled={busy || !connected || !s.rerollsRemaining}
              onClick={() => {
                setBusy(true);
                void action({ type: "reroll" })
                  .catch(() => {})
                  .finally(() => setBusy(false));
              }}
            >
              {lang === "de" ? "Meme wechseln" : "Change meme"} (
              {s.rerollsRemaining ?? 0})
            </button>
            <p className="subtle small">
              {lang === "de"
                ? "Dein Text bleibt beim Wechsel erhalten."
                : "Your text is kept when switching."}
            </p>
          </>
        )}
        <p className="subtle">{t("refresh")}</p>
      </section>
      <section className="panel editor-panel">
        {s.submitted ? (
          <div className="submitted">
            <span className="stamp">✓</span>
            <h2>{t("submitted")}</h2>
            <p>{t("waitInput")}</p>
          </div>
        ) : (
          <>
            <h2>{t("input")}</h2>
            <p className="subtle">
              {lang === "de"
                ? "Doppelklicke einen Text auf dem Bild, um ihn zu schreiben. Hier gestaltest du den ausgewählten Text."
                : "Double-click text on the image to write it. Style the selected text here."}
            </p>
            <div className="layer-tabs" role="tablist" aria-label={t("advanced")}>
              {input.layers.map((_, i) => (
                <button
                  key={i}
                  type="button"
                  role="tab"
                  aria-selected={selected === i}
                  className={selected === i ? "secondary selected" : "secondary"}
                  onClick={() => setSelected(i)}
                >
                  {t("text")} {i + 1}
                </button>
              ))}
            </div>
            {(() => {
              const l = input.layers[selected];
              return (
                <div className="layer style-controls">
                  <h3>{t("advanced")}</h3>
                  <label>
                    {t("font")}
                    <select
                      className="font-select"
                      value={l.font ?? "impact"}
                      onChange={(e) => update(selected, { font: e.target.value as FontId })}
                    >
                      {fontIds.map((font) => (
                        <option value={font} key={font}>
                          {{
                            impact: "Impact",
                            "arial-black": "Arial Black",
                            comic: "Comic Sans",
                            georgia: "Georgia",
                            courier: "Courier New",
                            trebuchet: "Trebuchet",
                            times: "Times New Roman",
                            system: lang === "de" ? "Systemschrift" : "System font",
                          }[font]}
                        </option>
                      ))}
                    </select>
                  </label>
                  {(["size", "outline"] as const).map((field) => (
                    <label key={field}>
                      {t(field)}
                      <input
                        type="number"
                        min={field === "size" ? 12 : 0}
                        max={field === "size" ? 120 : 5}
                        value={l[field]}
                        onChange={(e) =>
                          update(selected, {
                            [field]: Math.min(
                              field === "size" ? 120 : 5,
                              Math.max(
                                field === "size" ? 12 : 0,
                                Number(e.target.value),
                              ),
                            ),
                          })
                        }
                      />
                    </label>
                  ))}
                  <label>
                    {t("color")}
                    <input
                      type="color"
                      value={l.color}
                      onChange={(e) => update(selected, { color: e.target.value })}
                    />
                  </label>
                  <label>
                    {t("align")}
                    <select
                      value={l.align}
                      onChange={(e) =>
                        update(selected, { align: e.target.value as typeof l.align })
                      }
                    >
                      {(["left", "center", "right"] as const).map((a) => (
                        <option value={a} key={a}>
                          {t(a)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="check">
                    <input
                      type="checkbox"
                      checked={l.uppercase}
                      onChange={(e) => update(selected, { uppercase: e.target.checked })}
                    />
                    {t("uppercase")}
                  </label>
                </div>
              );
            })()}
            <div className="editor-actions">
              <button
                disabled={
                  busy || !connected || !input.layers.some((l) => l.text.trim())
                }
                onClick={() => {
                  setBusy(true);
                  void action({
                    type: "submit",
                    input: inputSchema.parse(input),
                  })
                    .catch(() => {})
                    .finally(() => setBusy(false));
                }}
              >
                {t("submit")}
              </button>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
