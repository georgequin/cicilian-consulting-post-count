"use client";

import { useEffect, useMemo, useState } from "react";
import type { Account, Post, StatPoint } from "@/lib/types";

const PLATFORMS = ["TikTok", "Instagram", "LinkedIn", "Facebook", "X", "YouTube", "WhatsApp"];
const COLOR: Record<string, string> = {
  LinkedIn: "var(--li)",
  Instagram: "var(--ig)",
  Facebook: "var(--fb)",
  TikTok: "var(--tt)",
  X: "var(--x)",
  WhatsApp: "var(--wa)",
  YouTube: "var(--yt)",
};

const fmtCompact = (n: number) =>
  new Intl.NumberFormat("en-GB", { notation: n >= 10000 ? "compact" : "standard", maximumFractionDigits: 1 }).format(n);
const fmtFull = (n: number) => new Intl.NumberFormat("en-GB").format(n);
const dayMs = 864e5;
const utc = (s: string) => Date.parse(s + "T00:00:00Z");

function latest(h: StatPoint[]) {
  for (let i = h.length - 1; i >= 0; i--) if (h[i].followers != null) return h[i];
  return null;
}
/** Latest value on or before `days` days before the latest snapshot. */
function before(h: StatPoint[], days: number, key: keyof StatPoint = "followers") {
  const last = latest(h);
  if (!last) return null;
  const cutoff = utc(last.date) - days * dayMs;
  for (let i = h.length - 1; i >= 0; i--) if (utc(h[i].date) <= cutoff && h[i][key] != null) return h[i];
  return null;
}

function Spark({ points, color }: { points: StatPoint[]; color: string }) {
  const pts = points.filter((p) => p.followers != null).slice(-30);
  if (pts.length < 2) return <div className="spark-empty">Growth chart appears after a second day of numbers</div>;
  const W = 160, H = 36, P = 3;
  const xs = pts.map((p) => utc(p.date)), ys = pts.map((p) => p.followers as number);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  const X = (x: number) => P + ((x - x0) / Math.max(1, x1 - x0)) * (W - 2 * P);
  const Y = (y: number) => (y1 === y0 ? H / 2 : H - P - ((y - y0) / (y1 - y0)) * (H - 2 * P));
  const d = pts.map((p, i) => `${i ? "L" : "M"}${X(xs[i]).toFixed(1)} ${Y(ys[i]).toFixed(1)}`).join(" ");
  const area = `${d} L${X(xs.at(-1)!).toFixed(1)} ${H} L${X(xs[0]).toFixed(1)} ${H} Z`;
  return (
    <svg className="spark" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label="Followers over time">
      <path d={area} fill={color} opacity="0.12" />
      <path d={d} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      <circle cx={X(xs.at(-1)!)} cy={Y(ys.at(-1)!)} r="3" fill={color} />
    </svg>
  );
}

function Delta({ now, then, label }: { now: number | null; then: number | null; label: string }) {
  if (now == null || then == null) return <span className="delta muted">{label}: no earlier number yet</span>;
  const d = now - then;
  const cls = d > 0 ? "up" : d < 0 ? "down" : "flat";
  const sign = d > 0 ? "+" : d < 0 ? "−" : "±";
  return (
    <span className={`delta ${cls}`}>
      {sign}
      {fmtFull(Math.abs(d))} {label}
    </span>
  );
}

type Sheet =
  | { mode: "add" }
  | { mode: "edit"; account: Account };

export default function Accounts({
  initial,
  posts,
  isAdmin,
  thisMonday,
  onToast,
}: {
  initial: Account[];
  posts: Post[];
  isAdmin: boolean;
  thisMonday: number;
  onToast: (m: string) => void;
}) {
  const [accounts, setAccounts] = useState(initial);
  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [busy, setBusy] = useState<"" | "save" | "refresh" | "delete">("");
  const [error, setError] = useState("");
  const [armDelete, setArmDelete] = useState(false);
  const [f, setF] = useState({ platform: "TikTok", handle: "", name: "", url: "", followers: "", following: "", likes: "", posts: "" });

  useEffect(() => {
    if (!sheet) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !busy && setSheet(null);
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [sheet, busy]);

  const loggedThisWeek = useMemo(() => {
    const m: Record<string, number> = {};
    for (const p of posts) {
      if (utc(p.date) - ((new Date(utc(p.date)).getUTCDay() + 6) % 7) * dayMs !== thisMonday) continue;
      for (const pl of p.platforms) m[pl] = (m[pl] ?? 0) + 1;
    }
    return m;
  }, [posts, thisMonday]);

  const total = accounts.reduce((s, a) => s + (latest(a.history)?.followers ?? 0), 0);
  const totalWeekAgo = accounts.reduce((s, a) => {
    const b = before(a.history, 7);
    return b ? s + (latest(a.history)!.followers! - (b.followers as number)) : s;
  }, 0);
  const anyWeekData = accounts.some((a) => before(a.history, 7));

  function open(s: Sheet) {
    setError("");
    setArmDelete(false);
    if (s.mode === "add") setF({ platform: "TikTok", handle: "", name: "", url: "", followers: "", following: "", likes: "", posts: "" });
    else {
      const l = latest(s.account.history);
      setF({
        platform: s.account.platform,
        handle: s.account.handle,
        name: s.account.name,
        url: s.account.url,
        followers: l?.followers?.toString() ?? "",
        following: l?.following?.toString() ?? "",
        likes: l?.likes?.toString() ?? "",
        posts: l?.posts?.toString() ?? "",
      });
    }
    setSheet(s);
  }

  async function call(url: string, method: string, body?: unknown) {
    const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, data };
  }
  const put = (a: Account) => setAccounts((as) => (as.some((x) => x.id === a.id) ? as.map((x) => (x.id === a.id ? a : x)) : [...as, a]));

  async function save() {
    if (!sheet) return;
    setBusy("save");
    setError("");
    try {
      if (sheet.mode === "add") {
        const r = await call("/api/accounts", "POST", { platform: f.platform, handle: f.handle, name: f.name, url: f.url });
        if (!r.ok) throw new Error(r.data.error || "Couldn't add the account.");
        let acc: Account = r.data.account;
        if (!latest(acc.history) && f.followers.trim()) {
          const s = await call(`/api/accounts/${acc.id}/stats`, "POST", { followers: f.followers, following: f.following, likes: f.likes, posts: f.posts });
          if (!s.ok) throw new Error(s.data.error || "Account added, but the numbers didn't save.");
          acc = s.data.account;
        }
        put(acc);
        onToast(latest(acc.history) ? "Account added" : "Account added. Add its follower count when you have it.");
      } else {
        const id = sheet.account.id;
        const r = await call(`/api/accounts/${id}`, "PUT", { platform: f.platform, handle: f.handle, name: f.name, url: f.url });
        if (!r.ok) throw new Error(r.data.error || "Couldn't save the account.");
        let acc: Account = r.data.account;
        const l = latest(sheet.account.history);
        const changed =
          f.followers.trim() &&
          (String(l?.followers ?? "") !== f.followers.trim() || String(l?.following ?? "") !== f.following.trim() ||
            String(l?.likes ?? "") !== f.likes.trim() || String(l?.posts ?? "") !== f.posts.trim());
        if (changed) {
          const s = await call(`/api/accounts/${id}/stats`, "POST", { followers: f.followers, following: f.following, likes: f.likes, posts: f.posts });
          if (!s.ok) throw new Error(s.data.error || "Couldn't save the numbers.");
          acc = s.data.account;
        }
        put(acc);
        onToast("Saved");
      }
      setSheet(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save.");
    } finally {
      setBusy("");
    }
  }

  async function refresh() {
    if (sheet?.mode !== "edit") return;
    setBusy("refresh");
    setError("");
    const r = await call(`/api/accounts/${sheet.account.id}/refresh`, "POST");
    if (r.data.account) {
      put(r.data.account);
      const l = latest(r.data.account.history);
      setSheet({ mode: "edit", account: r.data.account });
      setF((x) => ({ ...x, followers: l?.followers?.toString() ?? x.followers, following: l?.following?.toString() ?? x.following, likes: l?.likes?.toString() ?? x.likes, posts: l?.posts?.toString() ?? x.posts }));
    }
    if (!r.ok) setError(r.data.error || "Couldn't fetch the numbers.");
    else onToast("Numbers updated");
    setBusy("");
  }

  async function remove() {
    if (sheet?.mode !== "edit") return;
    if (!armDelete) return setArmDelete(true);
    setBusy("delete");
    const r = await call(`/api/accounts/${sheet.account.id}`, "DELETE");
    if (r.ok) {
      setAccounts((as) => as.filter((a) => a.id !== sheet.account.id));
      setSheet(null);
      onToast("Account removed");
    } else setError(r.data.error || "Couldn't remove it.");
    setBusy("");
  }

  if (!accounts.length && !isAdmin) return null;

  return (
    <section className="accounts" aria-labelledby="acc-title">
      <div className="acc-head">
        <div>
          <h2 id="acc-title">Accounts</h2>
          {accounts.length > 0 && (
            <div className="summary">
              <b className="num">{fmtFull(total)}</b> followers across {accounts.length} account{accounts.length === 1 ? "" : "s"}
              {anyWeekData && (
                <>
                  {" · "}
                  <span className={totalWeekAgo > 0 ? "up" : totalWeekAgo < 0 ? "down" : ""}>
                    {totalWeekAgo >= 0 ? "+" : "−"}
                    {fmtFull(Math.abs(totalWeekAgo))} this week
                  </span>
                </>
              )}
            </div>
          )}
        </div>
        {isAdmin && (
          <button className="text" onClick={() => open({ mode: "add" })}>
            + Add
          </button>
        )}
      </div>

      {accounts.length === 0 ? (
        <div className="empty">
          <strong>No accounts yet</strong>
          <span>Add each social account to track its followers week by week.</span>
        </div>
      ) : (
        <div className="acc-row">
          {accounts.map((a) => {
            const l = latest(a.history);
            const w = before(a.history, 7);
            const color = COLOR[a.platform] ?? "var(--accent)";
            const updated = l ? new Date(utc(l.date)).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" }) : "";
            return (
              <article className="acc" key={a.id} style={{ ["--pc" as string]: color }}>
                <div className="acc-top">
                  {a.avatarUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img className="avatar" src={a.avatarUrl} alt="" />
                  ) : (
                    <span className="avatar ph">{a.platform.slice(0, 2)}</span>
                  )}
                  <div className="acc-id">
                    <span className="acc-name">{a.name || a.handle}</span>
                    {a.url ? (
                      <a className="acc-handle" href={a.url} target="_blank" rel="noopener noreferrer">
                        <b>{a.platform}</b> · @{a.handle}
                      </a>
                    ) : (
                      <span className="acc-handle">
                        <b>{a.platform}</b> · @{a.handle}
                      </span>
                    )}
                  </div>
                </div>
                <div className="acc-big">
                  <span className="acc-num num">{l?.followers != null ? fmtCompact(l.followers) : "—"}</span>
                  <span className="acc-label">followers</span>
                </div>
                <Delta now={l?.followers ?? null} then={(w?.followers as number) ?? null} label="in 7 days" />
                <Spark points={a.history} color={color} />
                <dl className="acc-stats">
                  {l?.likes != null && (
                    <div>
                      <dt>Likes</dt>
                      <dd className="num">{fmtCompact(l.likes)}</dd>
                    </div>
                  )}
                  {l?.posts != null && (
                    <div>
                      <dt>{a.platform === "TikTok" || a.platform === "YouTube" ? "Videos" : "Posts"}</dt>
                      <dd className="num">{fmtCompact(l.posts)}</dd>
                    </div>
                  )}
                  {l?.following != null && (
                    <div>
                      <dt>Following</dt>
                      <dd className="num">{fmtCompact(l.following)}</dd>
                    </div>
                  )}
                </dl>
                <div className="acc-logged">
                  <b className="num">{loggedThisWeek[a.platform] ?? 0}</b> post{(loggedThisWeek[a.platform] ?? 0) === 1 ? "" : "s"} logged this week
                </div>
                <div className="acc-foot">
                  <span>{l ? `Updated ${updated} · ${l.source === "auto" ? "automatic" : "entered by hand"}` : "No numbers yet"}</span>
                  {isAdmin && (
                    <button className="text" onClick={() => open({ mode: "edit", account: a })}>
                      Update
                    </button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}

      {sheet && (
        <>
          <div className="scrim" onClick={() => !busy && setSheet(null)} />
          <aside className="sheet" role="dialog" aria-modal="true" aria-labelledby="acc-sheet-title">
            <div className="sheet-grip" />
            <div className="sheet-head">
              <h2 id="acc-sheet-title">{sheet.mode === "add" ? "Add an account" : `${sheet.account.platform} account`}</h2>
              <button className="text" onClick={() => !busy && setSheet(null)}>
                Close
              </button>
            </div>
            <form onSubmit={(e) => { e.preventDefault(); save(); }} noValidate>
              {sheet.mode === "add" && (
                <div className="field">
                  <span className="lbl" id="acc-plat-label">Platform</span>
                  <div className="plats" role="radiogroup" aria-labelledby="acc-plat-label">
                    {PLATFORMS.map((p) => (
                      <label key={p} className="plat" style={{ ["--pc" as string]: COLOR[p] }}>
                        <input type="radio" name="acc-platform" checked={f.platform === p} onChange={() => setF({ ...f, platform: p })} />
                        {p}
                      </label>
                    ))}
                  </div>
                </div>
              )}
              <div className="field">
                <label htmlFor="acc-handle">Handle or profile link</label>
                <input id="acc-handle" autoCapitalize="off" autoCorrect="off" value={f.handle} onChange={(e) => setF({ ...f, handle: e.target.value })} placeholder="@cecilia_consults" />
              </div>
              <div className="field">
                <label htmlFor="acc-name">Display name (optional)</label>
                <input id="acc-name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Filled in automatically where possible" />
              </div>
              <fieldset className="nums">
                <legend>
                  Today&apos;s numbers{sheet.mode === "add" ? " (optional for TikTok, which updates automatically)" : ""}
                </legend>
                <div className="row2">
                  <div className="field">
                    <label htmlFor="acc-followers">Followers</label>
                    <input id="acc-followers" inputMode="numeric" value={f.followers} onChange={(e) => setF({ ...f, followers: e.target.value })} />
                  </div>
                  <div className="field">
                    <label htmlFor="acc-following">Following</label>
                    <input id="acc-following" inputMode="numeric" value={f.following} onChange={(e) => setF({ ...f, following: e.target.value })} />
                  </div>
                  <div className="field">
                    <label htmlFor="acc-likes">Total likes</label>
                    <input id="acc-likes" inputMode="numeric" value={f.likes} onChange={(e) => setF({ ...f, likes: e.target.value })} />
                  </div>
                  <div className="field">
                    <label htmlFor="acc-posts">Posts / videos</label>
                    <input id="acc-posts" inputMode="numeric" value={f.posts} onChange={(e) => setF({ ...f, posts: e.target.value })} />
                  </div>
                </div>
                {sheet.mode === "edit" && (
                  <button type="button" className="text" onClick={refresh} disabled={!!busy} style={{ alignSelf: "flex-start" }}>
                    {busy === "refresh" ? "Fetching…" : "Fetch the numbers automatically"}
                  </button>
                )}
              </fieldset>
              {error && <div className="form-error" role="alert">{error}</div>}
            </form>
            <div className="sheet-foot">
              {sheet.mode === "edit" && (
                <button type="button" className="danger" onClick={remove} disabled={!!busy}>
                  {armDelete ? "Tap again to remove" : "Remove"}
                </button>
              )}
              <span className="grow" />
              <button type="button" className="primary" onClick={save} disabled={!!busy}>
                {busy === "save" ? "Saving…" : "Save"}
              </button>
            </div>
          </aside>
        </>
      )}
    </section>
  );
}
