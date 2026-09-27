"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { PLATFORMS, type Post } from "@/lib/types";

const PLATFORM_COLOR: Record<string, string> = {
  LinkedIn: "var(--li)",
  Instagram: "var(--ig)",
  Facebook: "var(--fb)",
  TikTok: "var(--tt)",
  X: "var(--x)",
  WhatsApp: "var(--wa)",
};

/* ---------- date helpers (dates are stored as plain YYYY-MM-DD, local to the team) ---------- */
const pad = (n: number) => String(n).padStart(2, "0");
function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function nowHM() {
  const d = new Date();
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function utc(s: string) {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}
function mondayOf(s: string) {
  const d = utc(s);
  return d.getTime() - ((d.getUTCDay() + 6) % 7) * 864e5;
}
const fmt = (t: number | Date, o: Intl.DateTimeFormatOptions) =>
  new Date(t).toLocaleDateString("en-GB", { timeZone: "UTC", ...o });
function host(u: string) {
  try {
    return new URL(u).hostname.replace(/^www\./, "");
  } catch {
    return u;
  }
}

/* ---------- screenshot shrink (keeps uploads well under the 4 MB limit) ---------- */
async function shrink(file: File): Promise<Blob> {
  if (file.size < 900_000 && /image\/(jpeg|png|webp)/.test(file.type)) return file;
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = () => rej(new Error("Couldn't read that image."));
      i.src = url;
    });
    const scale = Math.min(1, 1600 / Math.max(img.width, img.height));
    const c = document.createElement("canvas");
    c.width = Math.round(img.width * scale);
    c.height = Math.round(img.height * scale);
    c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
    return await new Promise<Blob>((res, rej) =>
      c.toBlob((b) => (b ? res(b) : rej(new Error("Couldn't prepare that image."))), "image/jpeg", 0.85)
    );
  } finally {
    URL.revokeObjectURL(url);
  }
}

type Draft = {
  date: string;
  time: string;
  title: string;
  link: string;
  platforms: string[];
  comment: string;
  imageUrl: string | null;
};
const blankDraft = (): Draft => ({
  date: todayISO(),
  time: nowHM(),
  title: "",
  link: "",
  platforms: [],
  comment: "",
  imageUrl: null,
});

function sortPosts(a: Post, b: Post) {
  return (b.date + b.time).localeCompare(a.date + a.time);
}

export default function PostLog({
  initialPosts,
  isAdmin,
  uploads,
  viewLocked,
}: {
  initialPosts: Post[];
  isAdmin: boolean;
  uploads: boolean;
  viewLocked: boolean;
}) {
  const [posts, setPosts] = useState<Post[]>(initialPosts);
  const [filter, setFilter] = useState<string>("All");
  const [editing, setEditing] = useState<Post | null>(null);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Draft>(blankDraft);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [armDelete, setArmDelete] = useState(false);
  const [zoom, setZoom] = useState<string | null>(null);
  const [toast, setToast] = useState("");
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const titleRef = useRef<HTMLInputElement>(null);

  function say(msg: string) {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 2600);
  }

  // Pick up posts logged from another device when the tab comes back into view.
  useEffect(() => {
    async function refresh() {
      if (document.visibilityState !== "visible") return;
      const res = await fetch("/api/posts", { cache: "no-store" }).catch(() => null);
      if (res?.ok) setPosts((await res.json()).posts);
    }
    document.addEventListener("visibilitychange", refresh);
    return () => document.removeEventListener("visibilitychange", refresh);
  }, []);

  // Lock page scroll behind the sheet; Escape closes it.
  useEffect(() => {
    if (!open && !zoom) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setZoom(null);
        if (!saving) setOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, zoom, saving]);

  useEffect(() => {
    if (open) setTimeout(() => titleRef.current?.focus({ preventScroll: true }), 60);
  }, [open]);

  const sorted = useMemo(() => [...posts].sort(sortPosts), [posts]);
  const shown = useMemo(
    () => (filter === "All" ? sorted : sorted.filter((p) => p.platforms.includes(filter))),
    [sorted, filter]
  );
  const thisMonday = mondayOf(todayISO());
  const thisWeekCount = sorted.filter((p) => mondayOf(p.date) === thisMonday).length;
  const usedPlatforms = PLATFORMS.filter((pl) => posts.some((p) => p.platforms.includes(pl)));

  const weeks = useMemo(() => {
    const m = new Map<number, Post[]>();
    for (const p of shown) {
      const k = mondayOf(p.date);
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(p);
    }
    return [...m.entries()];
  }, [shown]);

  function startNew() {
    setEditing(null);
    setDraft(blankDraft());
    setError("");
    setArmDelete(false);
    setOpen(true);
  }
  function startEdit(p: Post) {
    setEditing(p);
    setDraft({ date: p.date, time: p.time, title: p.title, link: p.link, platforms: p.platforms, comment: p.comment, imageUrl: p.imageUrl });
    setError("");
    setArmDelete(false);
    setOpen(true);
  }
  function close() {
    if (saving) return;
    setOpen(false);
  }
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft((d) => ({ ...d, [k]: v }));
  const togglePlatform = (pl: string) =>
    set("platforms", draft.platforms.includes(pl) ? draft.platforms.filter((x) => x !== pl) : [...draft.platforms, pl]);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploading(true);
    setError("");
    try {
      const blob = await shrink(file);
      const fd = new FormData();
      fd.append("file", blob, blob instanceof File ? blob.name : "screenshot.jpg");
      const res = await fetch("/api/upload", { method: "POST", body: fd });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Couldn't upload the screenshot.");
      set("imageUrl", data.url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't upload the screenshot.");
    } finally {
      setUploading(false);
    }
  }

  async function save(e?: React.FormEvent) {
    e?.preventDefault();
    if (!draft.title.trim() && !draft.link.trim()) {
      setError("Add what was posted or its link.");
      titleRef.current?.focus();
      return;
    }
    setSaving(true);
    setError("");
    try {
      const res = await fetch(editing ? `/api/posts/${editing.id}` : "/api/posts", {
        method: editing ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Couldn't save. Try again.");
      const post: Post = data.post;
      setPosts((ps) => (editing ? ps.map((p) => (p.id === post.id ? post : p)) : [post, ...ps]));
      setOpen(false);
      say(editing ? "Post updated" : "Post logged");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save. Try again.");
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!editing) return;
    if (!armDelete) return setArmDelete(true);
    setSaving(true);
    try {
      const res = await fetch(`/api/posts/${editing.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Couldn't delete.");
      setPosts((ps) => ps.filter((p) => p.id !== editing.id));
      setOpen(false);
      say("Post deleted");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't delete.");
    } finally {
      setSaving(false);
    }
  }

  async function logout() {
    await fetch("/api/logout", { method: "POST" }).catch(() => null);
    window.location.href = viewLocked ? "/login" : "/";
  }

  return (
    <>
      <main className="shell">
        <header className="top">
          <div>
            <span className="eyebrow">Cecilia Consulting · Social media</span>
            <h1>Post Log</h1>
            <div className="summary">
              {posts.length ? (
                <>
                  <b className="num">{thisWeekCount}</b> post{thisWeekCount === 1 ? "" : "s"} this week ·{" "}
                  <b className="num">{posts.length}</b> in total
                </>
              ) : (
                "No posts logged yet"
              )}
            </div>
          </div>
          <div className="top-actions">
            {isAdmin && (
              <button className="primary desktop-only" onClick={startNew}>
                Log a post
              </button>
            )}
            {isAdmin || viewLocked ? (
              <button className="text" onClick={logout}>
                Log out
              </button>
            ) : (
              <a className="hint" href="/login" style={{ padding: "10px 4px" }}>
                Editor login
              </a>
            )}
          </div>
        </header>

        {usedPlatforms.length > 1 && (
          <nav className="filters" aria-label="Filter by platform">
            {["All", ...usedPlatforms].map((f) => (
              <button key={f} className="filter" aria-pressed={filter === f} onClick={() => setFilter(f)}>
                {f}
              </button>
            ))}
          </nav>
        )}

        {weeks.length === 0 ? (
          <div className="empty">
            <strong>{posts.length ? `No ${filter} posts yet` : "Nothing logged yet"}</strong>
            <span>
              {posts.length
                ? "Try another platform."
                : "Each post you publish goes here with its link, platforms, date and a comment, grouped by week."}
            </span>
            {isAdmin && !posts.length && (
              <button className="primary" onClick={startNew}>
                Log the first post
              </button>
            )}
          </div>
        ) : (
          weeks.map(([monday, list]) => {
            const label =
              monday === thisMonday
                ? "This week"
                : monday === thisMonday - 7 * 864e5
                  ? "Last week"
                  : "Week of " + fmt(monday, { day: "numeric", month: "short" });
            return (
              <section className="week" key={monday} aria-label={label}>
                <div className="week-head">
                  <h2>
                    {label}
                    <span className="range">
                      {fmt(monday, { day: "numeric", month: "short" })} –{" "}
                      {fmt(monday + 6 * 864e5, { day: "numeric", month: "short", year: "numeric" })}
                    </span>
                  </h2>
                  <span className="count num">
                    {list.length} post{list.length === 1 ? "" : "s"}
                  </span>
                </div>
                <div className="feed">
                  {list.map((p) => (
                    <article className="entry" key={p.id}>
                      <div className="entry-main">
                        <div className="entry-body">
                          <div className="when">
                            {fmt(utc(p.date), { weekday: "short", day: "numeric", month: "short" })}
                            {p.time && ` · ${p.time}`}
                          </div>
                          <div className="title">
                            {p.link ? (
                              <a href={p.link} target="_blank" rel="noopener noreferrer">
                                {p.title || host(p.link)}
                              </a>
                            ) : (
                              p.title
                            )}
                          </div>
                          {p.platforms.length > 0 && (
                            <div className="chips">
                              {p.platforms.map((pl) => (
                                <span key={pl} className="chip" style={{ ["--pc" as string]: PLATFORM_COLOR[pl] ?? "var(--ink-3)" }}>
                                  {pl}
                                </span>
                              ))}
                            </div>
                          )}
                          {p.link && p.title && (
                            <div className="linkline">
                              ↗{" "}
                              <a href={p.link} target="_blank" rel="noopener noreferrer">
                                {host(p.link)}
                              </a>
                            </div>
                          )}
                        </div>
                        {p.imageUrl && (
                          <button className="thumb" onClick={() => setZoom(p.imageUrl)} aria-label="View screenshot">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={p.imageUrl} alt="" loading="lazy" />
                          </button>
                        )}
                      </div>
                      {p.comment && <div className="comment">{p.comment}</div>}
                      {isAdmin && (
                        <div className="entry-tools">
                          <button className="text" onClick={() => startEdit(p)}>
                            Edit
                          </button>
                        </div>
                      )}
                    </article>
                  ))}
                </div>
              </section>
            );
          })
        )}
      </main>

      {isAdmin && !open && (
        <button className="primary fab" onClick={startNew}>
          + Log a post
        </button>
      )}

      {open && (
        <>
          <div className="scrim" onClick={close} />
          <aside className="sheet" role="dialog" aria-modal="true" aria-labelledby="sheet-title">
            <div className="sheet-grip" />
            <div className="sheet-head">
              <h2 id="sheet-title">{editing ? "Edit post" : "Log a post"}</h2>
              <button className="text" onClick={close}>
                Close
              </button>
            </div>
            <form onSubmit={save} noValidate>
              <div className="row2">
                <div className="field">
                  <label htmlFor="f-date">Date posted</label>
                  <input id="f-date" type="date" value={draft.date} onChange={(e) => set("date", e.target.value)} />
                </div>
                <div className="field">
                  <label htmlFor="f-time">Time</label>
                  <input id="f-time" type="time" value={draft.time} onChange={(e) => set("time", e.target.value)} />
                </div>
              </div>
              <div className="field">
                <label htmlFor="f-title">What was posted</label>
                <input
                  id="f-title"
                  ref={titleRef}
                  value={draft.title}
                  onChange={(e) => set("title", e.target.value)}
                  placeholder="e.g. 5 Mistakes That Slow Business Growth"
                  enterKeyHint="next"
                />
              </div>
              <div className="field">
                <label htmlFor="f-link">Link to the post</label>
                <input
                  id="f-link"
                  type="url"
                  inputMode="url"
                  autoCapitalize="off"
                  autoCorrect="off"
                  value={draft.link}
                  onChange={(e) => set("link", e.target.value)}
                  placeholder="https://www.linkedin.com/posts/…"
                />
              </div>
              <div className="field">
                <span className="lbl" id="plats-label">Posted on</span>
                <div className="plats" role="group" aria-labelledby="plats-label">
                  {PLATFORMS.map((pl) => (
                    <label key={pl} className="plat" style={{ ["--pc" as string]: PLATFORM_COLOR[pl] }}>
                      <input type="checkbox" checked={draft.platforms.includes(pl)} onChange={() => togglePlatform(pl)} />
                      {pl}
                    </label>
                  ))}
                </div>
              </div>
              <div className="field">
                <label htmlFor="f-comment">Comment</label>
                <textarea
                  id="f-comment"
                  value={draft.comment}
                  onChange={(e) => set("comment", e.target.value)}
                  placeholder="Anything worth noting: early response, what to try next time…"
                />
              </div>
              {uploads && (
                <div className="field">
                  <span className="lbl">Screenshot (optional)</span>
                  <div className="shot">
                    {draft.imageUrl && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={draft.imageUrl} alt="Screenshot preview" />
                    )}
                    <label className="plat" style={{ ["--pc" as string]: "var(--accent)" }}>
                      <input type="file" accept="image/*" onChange={onFile} disabled={uploading} style={{ display: "none" }} />
                      {uploading ? "Uploading…" : draft.imageUrl ? "Replace" : "Add screenshot"}
                    </label>
                    {draft.imageUrl && !uploading && (
                      <button type="button" className="text danger" onClick={() => set("imageUrl", null)}>
                        Remove
                      </button>
                    )}
                  </div>
                  <span className="hint">Keeps a record of the post even if the link changes.</span>
                </div>
              )}
              {error && (
                <div className="form-error" role="alert">
                  {error}
                </div>
              )}
            </form>
            <div className="sheet-foot">
              {editing && (
                <button type="button" className="danger" onClick={remove} disabled={saving}>
                  {armDelete ? "Tap again to delete" : "Delete"}
                </button>
              )}
              <span className="grow" />
              <button type="button" className="primary" onClick={() => save()} disabled={saving || uploading}>
                {saving ? "Saving…" : "Save"}
              </button>
            </div>
          </aside>
        </>
      )}

      {zoom && (
        <button className="lightbox" onClick={() => setZoom(null)} aria-label="Close screenshot">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={zoom} alt="Post screenshot" />
        </button>
      )}

      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}
    </>
  );
}
