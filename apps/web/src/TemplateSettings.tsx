import {
  categoryIds,
  MAX_REROLLS_PER_ROUND,
  type Config,
} from "@memeparty/shared";
import { useEffect, useState } from "react";
import { useGame } from "./store";
const names = {
  de: {
    classic: "Klassiker",
    reactions: "Reaktionen",
    animals: "Tiere",
    comics: "Comics & Cartoons",
    work: "Arbeit & Alltag",
    gaming: "Gaming",
    movies: "Filme & Serien",
    school: "Schule & Studium",
    tech: "Technik",
    sports: "Sport",
    wholesome: "Wholesome",
    originals: "Eigene Illustrationen",
  },
  en: {
    classic: "Classics",
    reactions: "Reactions",
    animals: "Animals",
    comics: "Comics & cartoons",
    work: "Work & daily life",
    gaming: "Gaming",
    movies: "Movies & TV",
    school: "School & college",
    tech: "Technology",
    sports: "Sports",
    wholesome: "Wholesome",
    originals: "Original illustrations",
  },
};
export function TemplateSettings({
  config,
  onChange,
}: {
  config: Config;
  onChange: (config: Config) => void;
}) {
  const { language } = useGame();
  const german = language === "de";
  const selected = config.categories;
  const [count, setCount] = useState<number | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    const query = new URLSearchParams({
      categories: selected.join(","),
      family: config.family ? "1" : "0",
    });
    void fetch(`/api/templates/stats?${query}`, { signal: controller.signal })
      .then((response) => response.ok ? response.json() : Promise.reject())
      .then((data: { total: number }) => setCount(data.total))
      .catch(() => {});
    return () => controller.abort();
  }, [selected.join(","), config.family]);
  return (
    <div className="template-settings">
      <label>
        {german
          ? "Meme-Wechsel pro Spieler und Runde"
          : "Template changes per player per round"}
        <input
          type="number"
          min={0}
          max={MAX_REROLLS_PER_ROUND}
          value={config.rerolls}
          onChange={(e) =>
            onChange({
              ...config,
              rerolls: Math.min(
                MAX_REROLLS_PER_ROUND,
                Math.max(0, Number(e.target.value)),
              ),
            })
          }
        />
      </label>
      <p className="subtle small">
        {german
          ? "0 = kein Wechsel. In Same Meme starten alle gleich, dürfen bei aktiviertem Wechsel aber einzeln wechseln."
          : "0 = no changes. In Same Meme everyone starts with the same image, but may change individually if enabled."}
      </p>
      <fieldset className="category-options">
        <legend>{german ? "Meme-Kategorien" : "Meme categories"}</legend>
        {categoryIds.map((c) => (
          <label className="check" key={c}>
            <input
              type="checkbox"
              checked={selected.includes(c)}
              disabled={selected.includes(c) && selected.length === 1}
              onChange={(e) =>
                onChange({
                  ...config,
                  categories: e.target.checked
                    ? [...selected, c]
                    : selected.filter((v) => v !== c),
                })
              }
            />
            {names[language][c]}
          </label>
        ))}
      </fieldset>
      <p className="subtle small">
        {count ?? "…"}{" "}
        {german
          ? "Vorlagen im Datenbank-Pool · Externe Vorlagen benötigen eine Internetverbindung."
          : "templates in the database pool · External templates require an internet connection."}
      </p>
    </div>
  );
}
