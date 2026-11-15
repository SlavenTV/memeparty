import { useEffect, useState, type FormEvent } from "react";
import {
  loginAccount,
  logoutAccount,
  registerAccount,
  useGame,
} from "./store";

type Status = "ALL" | "UNREVIEWED" | "APPROVED" | "REJECTED";
interface AdminTemplate {
  id: string;
  name: string;
  url: string;
  thumbnailUrl: string | null;
  provider: string;
  source: string | null;
  moderationStatus: Exclude<Status, "ALL">;
  rating: "family" | "general" | "adult";
  active: boolean;
  nsfw: boolean;
  reportCount: number;
  categories: string[];
  reports: { id: string; reason: string; createdAt: string }[];
}
interface AdminResult {
  total: number;
  offset: number;
  limit: number;
  providers: string[];
  templates: AdminTemplate[];
}
interface Stats {
  total: number;
  unreviewed: number;
  approved: number;
  rejected: number;
  openReports: number;
}

export function AdminPanel({ close }: { close: () => void }) {
  const { account, nickname, language } = useGame();
  const de = language === "de";
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("admin@memeparty.local");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<Status>("UNREVIEWED");
  const [provider, setProvider] = useState("");
  const [offset, setOffset] = useState(0);
  const [result, setResult] = useState<AdminResult | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);

  const load = async () => {
    if (account?.role !== "ADMIN") return;
    setBusy(true);
    setError("");
    try {
      const params = new URLSearchParams({ status, offset: String(offset), limit: "24" });
      if (query.trim()) params.set("q", query.trim());
      if (provider) params.set("provider", provider);
      const [templatesResponse, statsResponse] = await Promise.all([
        fetch(`/api/admin/templates?${params}`),
        fetch("/api/admin/templates/stats"),
      ]);
      if (!templatesResponse.ok || !statsResponse.ok) throw Error("ADMIN_LOAD_FAILED");
      setResult((await templatesResponse.json()) as AdminResult);
      setStats((await statsResponse.json()) as Stats);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "ADMIN_LOAD_FAILED");
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => { void load(); }, [account?.role, status, provider, offset]);

  const authenticate = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      if (mode === "register") await registerAccount(email, password, nickname || "Admin");
      else await loginAccount(email, password);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "INVALID_REQUEST");
    } finally {
      setBusy(false);
    }
  };

  const update = async (template: AdminTemplate, patch: Record<string, unknown>) => {
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/admin/templates/${encodeURIComponent(template.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!response.ok) throw Error("UPDATE_FAILED");
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "UPDATE_FAILED");
      setBusy(false);
    }
  };

  return (
    <div className="admin-backdrop" role="dialog" aria-modal="true" aria-labelledby="admin-title">
      <section className="admin-panel">
        <div className="admin-heading">
          <div>
            <span className="eyebrow">MemeParty</span>
            <h1 id="admin-title">{de ? "Moderation" : "Moderation"}</h1>
          </div>
          <button className="secondary admin-close" onClick={close} aria-label={de ? "Schließen" : "Close"}>×</button>
        </div>
        {error && <div className="alert">{error}</div>}

        {!account ? (
          <form className="admin-auth panel" onSubmit={authenticate}>
            <h2>{mode === "login" ? (de ? "Admin anmelden" : "Admin login") : (de ? "Admin-Konto anlegen" : "Create admin account")}</h2>
            <p className="subtle">
              {de
                ? "Lokal ist admin@memeparty.local als Admin-Adresse vorbereitet. Das Passwort legst nur du fest."
                : "Locally, admin@memeparty.local is configured as the admin address. Only you choose the password."}
            </p>
            <label>E-Mail<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></label>
            <label>{de ? "Passwort (mindestens 12 Zeichen)" : "Password (at least 12 characters)"}<input type="password" minLength={mode === "register" ? 12 : 1} value={password} onChange={(event) => setPassword(event.target.value)} required /></label>
            <button disabled={busy}>{mode === "login" ? (de ? "Anmelden" : "Log in") : (de ? "Konto erstellen" : "Create account")}</button>
            <button type="button" className="text-button" onClick={() => setMode(mode === "login" ? "register" : "login")}>
              {mode === "login" ? (de ? "Noch kein Admin-Konto? Jetzt anlegen" : "No admin account yet? Create one") : (de ? "Schon registriert? Anmelden" : "Already registered? Log in")}
            </button>
          </form>
        ) : account.role !== "ADMIN" ? (
          <div className="panel admin-auth">
            <h2>{de ? "Kein Admin-Zugriff" : "No admin access"}</h2>
            <p>{de ? `${account.email} ist als normales Benutzerkonto angemeldet.` : `${account.email} is signed in as a regular user.`}</p>
            <button onClick={() => void logoutAccount()}>{de ? "Abmelden" : "Log out"}</button>
          </div>
        ) : (
          <>
            <div className="admin-account">
              <span>{account.email}</span>
              <button className="text-button" onClick={() => void logoutAccount()}>{de ? "Abmelden" : "Log out"}</button>
            </div>
            {stats && <div className="admin-stats">
              <span><b>{stats.unreviewed}</b>{de ? "Offen" : "Pending"}</span>
              <span><b>{stats.openReports}</b>{de ? "Meldungen" : "Reports"}</span>
              <span><b>{stats.approved}</b>{de ? "Freigegeben" : "Approved"}</span>
              <span><b>{stats.rejected}</b>{de ? "Abgelehnt" : "Rejected"}</span>
              <span><b>{stats.total}</b>{de ? "Gesamt" : "Total"}</span>
            </div>}
            <form className="admin-filters" onSubmit={(event) => { event.preventDefault(); setOffset(0); void load(); }}>
              <input type="search" placeholder={de ? "Vorlage suchen …" : "Search templates…"} value={query} onChange={(event) => setQuery(event.target.value)} />
              <select value={status} onChange={(event) => { setOffset(0); setStatus(event.target.value as Status); }}>
                <option value="UNREVIEWED">{de ? "Nicht geprüft" : "Unreviewed"}</option><option value="APPROVED">{de ? "Freigegeben" : "Approved"}</option><option value="REJECTED">{de ? "Abgelehnt" : "Rejected"}</option><option value="ALL">{de ? "Alle" : "All"}</option>
              </select>
              <select value={provider} onChange={(event) => { setOffset(0); setProvider(event.target.value); }}>
                <option value="">{de ? "Alle Quellen" : "All providers"}</option>{result?.providers.map((item) => <option key={item}>{item}</option>)}
              </select>
              <button disabled={busy}>{de ? "Suchen" : "Search"}</button>
            </form>
            <p className="subtle">{result ? `${result.total} ${de ? "Vorlagen" : "templates"}` : (de ? "Lade …" : "Loading…")}</p>
            <div className="admin-grid">
              {result?.templates.map((template) => <article className="admin-card panel" key={template.id}>
                <img src={template.thumbnailUrl ?? template.url} alt="" loading="lazy" />
                <div className="admin-card-body">
                  <div className="admin-card-title"><strong>{template.name}</strong><span className={`status status-${template.moderationStatus.toLowerCase()}`}>{template.moderationStatus}</span></div>
                  <p className="subtle small">{template.provider} · {template.categories.join(", ") || "–"} · {template.reportCount} {de ? "Meldungen" : "reports"}</p>
                  {template.reports.map((report) => <blockquote key={report.id}>{report.reason}</blockquote>)}
                  <div className="admin-options">
                    <label>{de ? "Einstufung" : "Rating"}<select value={template.rating} onChange={(event) => void update(template, { rating: event.target.value })}><option value="family">Family</option><option value="general">General</option><option value="adult">Adult</option></select></label>
                    <label className="check"><input type="checkbox" checked={template.nsfw} onChange={(event) => void update(template, { nsfw: event.target.checked })} /> NSFW</label>
                  </div>
                  <div className="admin-actions">
                    <button disabled={busy} onClick={() => void update(template, { moderationStatus: "APPROVED", active: true })}>{de ? "Freigeben" : "Approve"}</button>
                    <button className="secondary" disabled={busy} onClick={() => void update(template, { moderationStatus: "REJECTED", active: false })}>{de ? "Ablehnen" : "Reject"}</button>
                    <button className="text-button" disabled={busy} onClick={() => void update(template, { active: !template.active })}>{template.active ? (de ? "Deaktivieren" : "Deactivate") : (de ? "Aktivieren" : "Activate")}</button>
                  </div>
                  {template.source && <a href={template.source} target="_blank" rel="noreferrer">{de ? "Quelle öffnen" : "Open source"}</a>}
                </div>
              </article>)}
            </div>
            {result && <div className="admin-pagination">
              <button className="secondary" disabled={busy || offset === 0} onClick={() => setOffset(Math.max(0, offset - result.limit))}>← {de ? "Zurück" : "Back"}</button>
              <span>{Math.floor(offset / result.limit) + 1} / {Math.max(1, Math.ceil(result.total / result.limit))}</span>
              <button className="secondary" disabled={busy || offset + result.limit >= result.total} onClick={() => setOffset(offset + result.limit)}>{de ? "Weiter" : "Next"} →</button>
            </div>}
          </>
        )}
      </section>
    </div>
  );
}
