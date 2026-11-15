import { useEffect, useState } from "react";
import type { Config, Template } from "@memeparty/shared";
import { useGame } from "./store";

type ApiTemplate = Template & { provider?: string; thumbnailUrl?: string | null };

export function TemplateBrowser({ config }: { config: Config }) {
  const { language } = useGame();
  const de = language === "de";
  const [query, setQuery] = useState("");
  const [templates, setTemplates] = useState<ApiTemplate[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      const params = new URLSearchParams({
        q: query,
        categories: config.categories.join(","),
        family: config.family ? "1" : "0",
        limit: "12",
      });
      setLoading(true);
      void fetch(`/api/templates?${params}`, { signal: controller.signal })
        .then((response) => response.ok ? response.json() : Promise.reject())
        .then((data: { total: number; templates: ApiTemplate[] }) => {
          setTotal(data.total);
          setTemplates(data.templates);
        })
        .catch(() => {})
        .finally(() => setLoading(false));
    }, 250);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, config.categories.join(","), config.family]);

  return (
    <details className="template-browser">
      <summary>{de ? "Vorlagen durchsuchen" : "Browse templates"}</summary>
      <input
        type="search"
        value={query}
        placeholder={de ? "Meme suchen …" : "Search memes …"}
        aria-label={de ? "Meme-Vorlagen durchsuchen" : "Search meme templates"}
        onKeyDown={(event) => {
          if (event.key === "Enter") event.preventDefault();
        }}
        onChange={(event) => setQuery(event.target.value)}
      />
      <p className="subtle small">
        {loading ? (de ? "Suche …" : "Searching …") : `${total} ${de ? "Treffer" : "results"}`}
      </p>
      <div className="template-preview-grid">
        {templates.map((template) => (
          <article key={template.id} title={template.name}>
            <img
              loading="lazy"
              src={template.thumbnailUrl ?? template.url}
              alt={template.name}
            />
            <span>{template.name}</span>
          </article>
        ))}
      </div>
    </details>
  );
}
