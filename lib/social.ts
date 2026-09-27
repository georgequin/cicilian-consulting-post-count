import { BOT_UA, BROWSER_UA, allowed, copyImage, get, meta } from "./preview";

export const ACCOUNT_PLATFORMS = ["TikTok", "Instagram", "LinkedIn", "Facebook", "X", "YouTube", "WhatsApp"] as const;

export type FetchedStats = {
  name?: string;
  avatarSrc?: string; // remote image; copied to Blob by the caller
  followers?: number;
  following?: number;
  likes?: number;
  posts?: number;
};

/** "@cecilia_consults", "cecilia_consults" or a full profile URL → the bare handle. */
export function cleanHandle(platform: string, raw: string): string {
  let h = raw.trim();
  try {
    const u = new URL(h.startsWith("http") ? h : "https://x.invalid/" + h);
    if (u.hostname !== "x.invalid") {
      const parts = u.pathname.split("/").filter(Boolean);
      if (platform === "LinkedIn" && (parts[0] === "company" || parts[0] === "in")) h = parts[1] ?? "";
      else if (platform === "YouTube" && parts[0]?.startsWith("@")) h = parts[0];
      else h = parts[0] ?? "";
    }
  } catch {
    /* keep as typed */
  }
  return h.replace(/^@/, "").replace(/[/?#].*$/, "").slice(0, 100);
}

export function profileUrl(platform: string, handle: string): string {
  const h = encodeURIComponent(handle);
  switch (platform) {
    case "TikTok": return `https://www.tiktok.com/@${h}`;
    case "Instagram": return `https://www.instagram.com/${h}/`;
    case "LinkedIn": return `https://www.linkedin.com/company/${h}/`;
    case "Facebook": return `https://www.facebook.com/${h}`;
    case "X": return `https://x.com/${h}`;
    case "YouTube": return `https://www.youtube.com/@${h}`;
    default: return "";
  }
}

/** "1,234", "1.2K", "3.4M", "12 k" → number */
export function parseCount(s: string | undefined | null): number | undefined {
  if (!s) return undefined;
  const m = String(s).trim().replace(/,/g, "").match(/^([\d.]+)\s*([kKmMbB])?/);
  if (!m) return undefined;
  const n = parseFloat(m[1]);
  if (!isFinite(n)) return undefined;
  const mult = { k: 1e3, m: 1e6, b: 1e9 }[(m[2] ?? "").toLowerCase() as "k" | "m" | "b"] ?? 1;
  return Math.round(n * mult);
}

async function tiktok(handle: string): Promise<FetchedStats | null> {
  const res = await get(`https://www.tiktok.com/@${encodeURIComponent(handle)}?lang=en`, BROWSER_UA, 8000);
  if (!res?.ok) return null;
  const html = await res.text();
  const m = html.match(/<script[^>]+id="__UNIVERSAL_DATA_FOR_REHYDRATION__"[^>]*>([\s\S]*?)<\/script>/);
  if (m) {
    try {
      const data = JSON.parse(m[1]);
      const info = data?.__DEFAULT_SCOPE__?.["webapp.user-detail"]?.userInfo;
      const st = info?.statsV2 ?? info?.stats;
      if (info?.user && st) {
        return {
          name: info.user.nickname,
          avatarSrc: info.user.avatarMedium || info.user.avatarThumb,
          followers: Number(st.followerCount),
          following: Number(st.followingCount),
          likes: Number(st.heartCount ?? st.heart),
          posts: Number(st.videoCount),
        };
      }
    } catch {
      /* fall through to meta tags */
    }
  }
  return fromMeta(html);
}

/** Many profile pages put "1,234 Followers, 56 Following, 78 Posts" in their description tags. */
function fromMeta(html: string): FetchedStats | null {
  const desc = meta(html, ["og:description", "description", "twitter:description"]);
  const title = meta(html, ["og:title", "twitter:title"]);
  const grab = (re: RegExp) => parseCount(desc.match(re)?.[1]);
  const out: FetchedStats = {
    followers: grab(/([\d.,]+\s*[KkMmBb]?)\s+(?:Followers|followers)/),
    following: grab(/([\d.,]+\s*[KkMmBb]?)\s+Following/i),
    posts: grab(/([\d.,]+\s*[KkMmBb]?)\s+(?:Posts|posts|Videos|videos)/),
    likes: grab(/([\d.,]+\s*[KkMmBb]?)\s+(?:Likes|likes)/),
    name: title.replace(/\s*[(•|].*$/, "").trim() || undefined,
    avatarSrc: meta(html, ["og:image"]) || undefined,
  };
  return out.followers != null ? out : null;
}

async function viaMeta(url: string): Promise<FetchedStats | null> {
  for (const ua of [BOT_UA, BROWSER_UA]) {
    const res = await get(url, ua, 8000);
    if (!res?.ok) continue;
    const r = fromMeta(await res.text());
    if (r) return r;
  }
  return null;
}

/** Best effort. Returns null when the platform doesn't share numbers publicly (the editor enters them). */
export async function fetchStats(platform: string, handle: string, url: string): Promise<FetchedStats | null> {
  try {
    if (platform === "TikTok" && handle) return await tiktok(handle);
    const target = url || profileUrl(platform, handle);
    if (!target || !allowed(target) || platform === "WhatsApp") return null;
    return await viaMeta(target);
  } catch {
    return null;
  }
}

export async function storeAvatar(src: string | undefined): Promise<string | null> {
  if (!src) return null;
  return copyImage(src).catch(() => null);
}
