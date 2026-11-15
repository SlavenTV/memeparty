import { useEffect, useRef, useState, type PointerEvent } from "react";
import { templates, type Input, type Template } from "@memeparty/shared";
type Layer = Input["layers"][number];
const fontFamilies = {
  impact: 'Impact, Haettenschweiler, "Arial Narrow Bold", sans-serif',
  "arial-black": '"Arial Black", Arial, sans-serif',
  comic: '"Comic Sans MS", "Comic Sans", cursive',
  georgia: 'Georgia, "Times New Roman", serif',
  courier: '"Courier New", Courier, monospace',
  trebuchet: '"Trebuchet MS", Arial, sans-serif',
  times: '"Times New Roman", Times, serif',
  system: 'Inter, ui-sans-serif, system-ui, sans-serif',
} as const;
type Gesture = {
  index: number;
  kind: "move" | "resize" | "rotate";
  x: number;
  y: number;
  width: number;
  height: number;
  layer: Layer;
  centerX: number;
  centerY: number;
  angle: number;
};
const clamp = (v: number, min: number, max: number) =>
  Math.min(max, Math.max(min, v));
const remoteTemplates = new Map<string, Template>();
const templateRequests = new Map<string, Promise<Template>>();
function fetchTemplate(id: string) {
  const cached = remoteTemplates.get(id);
  if (cached) return Promise.resolve(cached);
  const pending = templateRequests.get(id);
  if (pending) return pending;
  const request = fetch(`/api/templates/${encodeURIComponent(id)}`)
    .then((response) => {
      if (!response.ok) throw Error("TEMPLATE_NOT_FOUND");
      return response.json() as Promise<Template>;
    })
    .then((template) => {
      remoteTemplates.set(id, template);
      templateRequests.delete(id);
      return template;
    })
    .catch((error) => {
      templateRequests.delete(id);
      throw error;
    });
  templateRequests.set(id, request);
  return request;
}
export function Meme({
  templateId,
  input,
  onUpdate,
  selected = 0,
  onSelect,
  maxLength = 180,
  language = "de",
}: {
  templateId: string;
  input: Input;
  onUpdate?: (i: number, patch: Partial<Layer>) => void;
  selected?: number;
  onSelect?: (i: number) => void;
  maxLength?: number;
  language?: "de" | "en";
}) {
  const localTemplate = templates.find((t) => t.id === templateId);
  const [remoteTemplate, setRemoteTemplate] = useState<Template | null>(
    remoteTemplates.get(templateId) ?? null,
  );
  const root = useRef<HTMLDivElement>(null);
  const gesture = useRef<Gesture | null>(null);
  const [editing, setEditing] = useState<number | null>(null);
  const [failedId, setFailedId] = useState<string | null>(null);
  const [reported, setReported] = useState(false);
  const editable = !!onUpdate;
  const de = language === "de";
  useEffect(() => {
    setFailedId(null);
    if (localTemplate) {
      setRemoteTemplate(null);
      return;
    }
    let current = true;
    setRemoteTemplate(remoteTemplates.get(templateId) ?? null);
    void fetchTemplate(templateId)
      .then((template) => {
        if (current) setRemoteTemplate(template);
      })
      .catch(() => {
        if (current) setFailedId(templateId);
      });
    return () => {
      current = false;
    };
  }, [templateId, localTemplate]);
  const template = localTemplate ?? remoteTemplate;
  async function reportTemplate() {
    if (!template || reported) return;
    const reason = window.prompt(
      de ? "Warum möchtest du diese Vorlage melden?" : "Why are you reporting this template?",
    );
    if (!reason?.trim()) return;
    const response = await fetch(`/api/templates/${encodeURIComponent(template.id)}/report`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason }),
    });
    if (response.ok || response.status === 409) setReported(true);
  }
  function begin(
    e: PointerEvent<HTMLElement>,
    index: number,
    kind: Gesture["kind"],
  ) {
    if (!onUpdate) return;
    setEditing(null);
    e.preventDefault();
    e.stopPropagation();
    onSelect?.(index);
    const box = root.current!.getBoundingClientRect();
    const caption = e.currentTarget
      .closest(".caption")!
      .getBoundingClientRect();
    const centerX = caption.left + caption.width / 2,
      centerY = caption.top + caption.height / 2;
    gesture.current = {
      index,
      kind,
      x: e.clientX,
      y: e.clientY,
      width: box.width,
      height: box.height,
      layer: { ...input.layers[index] },
      centerX,
      centerY,
      angle: Math.atan2(e.clientY - centerY, e.clientX - centerX),
    };
    e.currentTarget.setPointerCapture(e.pointerId);
  }
  function move(e: PointerEvent<HTMLElement>) {
    const g = gesture.current;
    if (!g || !onUpdate) return;
    const dx = ((e.clientX - g.x) / g.width) * 100,
      dy = ((e.clientY - g.y) / g.height) * 100;
    if (g.kind === "move")
      onUpdate(g.index, {
        x: clamp(g.layer.x + dx, 0, 100 - g.layer.width),
        y: clamp(g.layer.y + dy, 0, 90),
      });
    if (g.kind === "resize") {
      const angle = (g.layer.rotation * Math.PI) / 180;
      const localDx =
        (e.clientX - g.x) * Math.cos(angle) +
        (e.clientY - g.y) * Math.sin(angle);
      const width = clamp(
        g.layer.width + (localDx / g.width) * 100,
        20,
        100 - g.layer.x,
      );
      onUpdate(g.index, {
        width,
        size: clamp(g.layer.size + (dx + dy) * 0.6, 12, 120),
      });
    }
    if (g.kind === "rotate") {
      const angle = Math.atan2(e.clientY - g.centerY, e.clientX - g.centerX);
      const delta = Math.atan2(
        Math.sin(angle - g.angle),
        Math.cos(angle - g.angle),
      );
      onUpdate(g.index, {
        rotation:
          ((g.layer.rotation + (delta * 180) / Math.PI + 540) % 360) - 180,
      });
    }
  }
  return (
    <>
      <div
        ref={root}
        className={`meme meme-${templateId} ${editable ? "meme-editable" : ""}`}
        style={{ aspectRatio: template?.aspectRatio ?? 1 }}
      >
        {template && (
          <img
            src={template.url}
            alt={template.name}
            draggable={false}
            onError={() => setFailedId(templateId)}
          />
        )}
        {!template && failedId !== templateId && (
          <div className="image-error">{de ? "Vorlage wird geladen …" : "Loading template …"}</div>
        )}
        {failedId === templateId && (
          <div className="image-error">
            {de
              ? "Vorlage konnte nicht geladen werden. Prüfe deine Internetverbindung zu Imgflip."
              : "Could not load this template. Check your connection to Imgflip."}
          </div>
        )}
        {input.layers.map((l, i) => (
          <div
            key={i}
            className={`caption ${editable ? "interactive-caption" : ""} ${editable && selected === i ? "caption-selected" : ""}`}
            style={{
              left: `${l.x}%`,
              top: `${l.y}%`,
              width: `${l.width}%`,
              fontSize: `${l.size / 6}cqw`,
              fontFamily: fontFamilies[l.font ?? "impact"],
              color: l.color,
              WebkitTextStroke: `${l.outline}px #111`,
              paintOrder: "stroke fill",
              textAlign: l.align,
              transform: `rotate(${l.rotation}deg)`,
              textTransform: l.uppercase ? "uppercase" : "none",
            }}
            onPointerDown={(e) => begin(e, i, "move")}
            onPointerMove={move}
            onPointerUp={() => {
              gesture.current = null;
            }}
            onPointerCancel={() => {
              gesture.current = null;
            }}
            onDoubleClick={() => {
              if (editable) {
                onSelect?.(i);
                setEditing(i);
              }
            }}
            tabIndex={editable ? 0 : undefined}
            role={editable ? "group" : undefined}
            aria-label={
              editable
                ? `${de ? "Textfeld" : "Text layer"} ${i + 1}`
                : undefined
            }
            onKeyDown={(e) => {
              if (!onUpdate || editing !== null) return;
              if (e.key === "Enter") {
                e.preventDefault();
                setEditing(i);
                return;
              }
              const steps: Record<string, [number, number]> = {
                ArrowLeft: [-1, 0],
                ArrowRight: [1, 0],
                ArrowUp: [0, -1],
                ArrowDown: [0, 1],
              };
              if (steps[e.key]) {
                e.preventDefault();
                onSelect?.(i);
                const [dx, dy] = steps[e.key];
                onUpdate(i, {
                  x: clamp(l.x + dx, 0, 100 - l.width),
                  y: clamp(l.y + dy, 0, 90),
                });
              }
            }}
          >
            {editing === i && editable ? (
              <textarea
                autoFocus
                className="canvas-text-input"
                aria-label={`${de ? "Text direkt bearbeiten" : "Edit text directly"} ${i + 1}`}
                value={l.text}
                maxLength={maxLength}
                style={{
                  height: `${Math.max(2, l.text.split("\n").length + 1)}em`,
                }}
                onPointerDown={(e) => e.stopPropagation()}
                onChange={(e) => onUpdate!(i, { text: e.target.value })}
                onBlur={() => setEditing(null)}
                onKeyDown={(e) => {
                  e.stopPropagation();
                  if (e.key === "Escape") setEditing(null);
                }}
              />
            ) : (
              <span className="caption-text">
                {l.text ||
                  (editable
                    ? de
                      ? "Doppelklick: Text"
                      : "Double-click: text"
                    : "")}
              </span>
            )}
            {editable && selected === i && (
              <div
                className="caption-tools"
                onPointerDown={(e) => e.stopPropagation()}
              >
                <button
                  type="button"
                  className="caption-handle"
                  aria-label={de ? "Text verschieben" : "Move text"}
                  title={de ? "Ziehen zum Verschieben" : "Drag to move"}
                  onPointerDown={(e) => {
                    setEditing(null);
                    begin(e, i, "move");
                  }}
                  onPointerMove={move}
                  onPointerUp={() => {
                    gesture.current = null;
                  }}
                >
                  ✥
                </button>
                <button
                  type="button"
                  className="caption-handle"
                  aria-label={de ? "Text bearbeiten" : "Edit text"}
                  onClick={() => setEditing(i)}
                >
                  ✎
                </button>
                <button
                  type="button"
                  className="caption-handle"
                  aria-label={de ? "Text drehen" : "Rotate text"}
                  title={de ? "Ziehen zum Drehen" : "Drag to rotate"}
                  onPointerDown={(e) => begin(e, i, "rotate")}
                  onPointerMove={move}
                  onPointerUp={() => {
                    gesture.current = null;
                  }}
                >
                  ↻
                </button>
              </div>
            )}
            {editable && selected === i && (
              <button
                type="button"
                className="resize-handle"
                aria-label={de ? "Textgröße ändern" : "Resize text"}
                title={de ? "Ziehen: Größe & Breite" : "Drag: size & width"}
                onPointerDown={(e) => begin(e, i, "resize")}
                onPointerMove={move}
                onPointerUp={() => {
                  gesture.current = null;
                }}
              >
                ↔
              </button>
            )}
          </div>
        ))}
      </div>
      {editable && (
        <p className="template-credit">
          {template?.name}
          {template?.source && (
            <>
              {" "}
              ·{" "}
              <a href={template.source} target="_blank" rel="noreferrer">
                {de ? "Quelle ↗" : "Source ↗"}
              </a>
            </>
          )}
          {template && !template.id.startsWith("deadline") && !template.id.startsWith("plan") && !template.id.startsWith("weekend") && (
            <>
              {" · "}
              <button
                type="button"
                className="template-report"
                disabled={reported}
                onClick={() => void reportTemplate()}
              >
                {reported
                  ? de ? "Gemeldet" : "Reported"
                  : de ? "Vorlage melden" : "Report template"}
              </button>
            </>
          )}
        </p>
      )}
    </>
  );
}
