import { put } from "@vercel/blob";
import { randomUUID } from "node:crypto";
import { uploadsEnabled } from "./blob";
import type { Preview } from "./types";

/**
 * Fetches a thumbnail, caption and account name for a post link.
 * TikTok and YouTube use their official oEmbed endpoints; everything else falls back to the
 * page's Open Graph tags. The thumbnail is copied into Blob storage because platform CDN
 * links (TikTok's especially) expire after a few days.
 */

export const BOT_UA = "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)";
export const BROWSER_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";
const MAX_IMAGE_BYTES = 6 * 1024 * 1024;

export async function get(url: string, ua: string, ms = 6000): Promise<Response | null> {
  try {
    return await fetch(url, {
      redirect: "follow",
      headers: { "User-Agent": ua, Accept: "text/html,application/json,image/*;q=0.9,*/*;q=0.8", "Accept-Language": "en" },
      signal: AbortSignal.timeout(ms),
    });
  } catch {
    return null;
  }
}

/** Only public http(s) hosts; refuses localhost and bare IP addresses. */
export function allowed(raw: string): URL | null {
  try {
    const u = new URL(raw);
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    const h = u.hostname;
    if (h === "localhost" || h.endsWith(".local") || h.endsWith(".internal")) return null;
    if (/^\d{1,3}(\.\d{1,3}){3}$/.test(h) || h.includes(":")) return null;
    return u;
  } catch {
    return null;
  }
}

function decode(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .trim();
}

export function meta(html: string, names: string[]): string {
  for (const name of names) {
    const re = new RegExp(
      `<meta[^>]+(?:property|name)=["']${name}["'][^>]*content=["']([^"']*)["']|<meta[^>]+content=["']([^"']*)["'][^>]*(?:property|name)=["']${name}["']`,
      "i"
    );
    const m = html.match(re);
    const v = m && (m[1] ?? m[2]);
    if (v) return decode(v);
  }
  return "";
}

type Raw = { image: string; title: string; author: string };

async function oembed(endpoint: string): Promise<Raw | null> {
  const res = await get(endpoint, BROWSER_UA);
  if (!res?.ok) return null;
  const j = (await res.json().catch(() => null)) as Record<string, unknown> | null;
  if (!j) return null;
  return {
    image: String(j.thumbnail_url ?? ""),
    title: String(j.title ?? ""),
    author: String(j.author_name ?? ""),
  };
}

async function openGraph(url: string): Promise<Raw | null> {
  for (const ua of [BOT_UA, BROWSER_UA]) {
    const res = await get(url, ua);
    if (!res?.ok || !(res.headers.get("content-type") ?? "").includes("html")) continue;
    const html = (await res.text()).slice(0, 600_000);
    const image = meta(html, ["og:image:secure_url", "og:image", "twitter:image", "twitter:image:src"]);
    const title = meta(html, ["og:title", "twitter:title"]) || decode(html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1] ?? "");
    const author = meta(html, ["og:site_name", "author", "twitter:creator"]);
    if (image || title) return { image: image ? new URL(image, res.url).toString() : "", title, author };
  }
  return null;
}

async function discover(link: string): Promise<Raw | null> {
  const start = allowed(link);
  if (!start) return null;

  // Follow short links (vt.tiktok.com, youtu.be, lnkd.in …) to the real page first.
  let finalUrl = start.toString();
  const host = start.hostname.replace(/^www\./, "");
  if (/(^|\.)tiktok\.com$|^youtu\.be$|^lnkd\.in$|^fb\.watch$|^t\.co$/.test(host)) {
    const res = await get(finalUrl, BROWSER_UA);
    if (res?.url) finalUrl = res.url;
  }
  const f = allowed(finalUrl);
  if (!f) return null;
  const fh = f.hostname.replace(/^www\./, "");

  if (/(^|\.)tiktok\.com$/.test(fh)) {
    const canonical = `https://www.tiktok.com${f.pathname}`;
    const r = await oembed(`https://www.tiktok.com/oembed?url=${encodeURIComponent(canonical)}`);
    if (r) return r;
  }
  if (/(^|\.)youtube\.com$|^youtu\.be$/.test(fh)) {
    const r = await oembed(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(finalUrl)}`);
    if (r) return r;
  }
  return openGraph(finalUrl);
}

export async function copyImage(src: string): Promise<string | null> {
  if (!src || !uploadsEnabled() || !allowed(src)) return null;
  const res = await get(src, BROWSER_UA, 8000);
  if (!res?.ok) return null;
  const type = (res.headers.get("content-type") ?? "").split(";")[0].trim();
  const ext = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/avif": "avif", "image/gif": "gif" }[type];
  if (!ext) return null;
  const buf = Buffer.from(await res.arrayBuffer());
  if (!buf.length || buf.length > MAX_IMAGE_BYTES) return null;
  const blob = await put(`thumbnails/${randomUUID()}.${ext}`, buf, { access: "public", contentType: type });
  return blob.url;
}

/** Best effort: returns null when the link gives nothing usable. Never throws. */
export async function buildPreview(link: string): Promise<Preview | null> {
  try {
    if (!link) return null;
    const raw = await discover(link);
    if (!raw) return null;
    const thumbUrl = await copyImage(raw.image).catch(() => null);
    const title = raw.title.replace(/\s+/g, " ").trim().slice(0, 500);
    const author = raw.author.replace(/\s+/g, " ").trim().slice(0, 120);
    if (!thumbUrl && !title) return null;
    return { thumbUrl, title, author };
  } catch {
    return null;
  }
}
