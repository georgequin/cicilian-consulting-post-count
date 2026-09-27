import { PLATFORMS, type PostInput } from "./types";

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

export type Result = { ok: true; value: PostInput } | { ok: false; error: string };

function str(v: unknown, max: number): string {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

function isHttpUrl(s: string): boolean {
  try {
    const u = new URL(s);
    return u.protocol === "https:" || u.protocol === "http:";
  } catch {
    return false;
  }
}

export function parsePostInput(body: unknown): Result {
  if (!body || typeof body !== "object") return { ok: false, error: "Send the post as JSON." };
  const b = body as Record<string, unknown>;

  const date = str(b.date, 10);
  const parsed = DATE.test(date) ? new Date(date + "T00:00:00Z") : null;
  if (!parsed || Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date)
    return { ok: false, error: "Pick the date it was posted." };

  const time = str(b.time, 5);
  if (time && !TIME.test(time)) return { ok: false, error: "Time should look like 09:30." };

  const title = str(b.title, 300);
  const link = str(b.link, 2000);
  if (!title && !link) return { ok: false, error: "Add what was posted or its link." };
  if (link && !isHttpUrl(link)) return { ok: false, error: "The link should start with https://" };

  const platforms = Array.isArray(b.platforms)
    ? [...new Set(b.platforms.filter((p): p is string => typeof p === "string" && (PLATFORMS as readonly string[]).includes(p)))]
    : [];

  const comment = str(b.comment, 4000);

  const imageRaw = b.imageUrl == null ? "" : str(b.imageUrl, 2000);
  if (imageRaw && !isHttpUrl(imageRaw)) return { ok: false, error: "The screenshot link is not valid." };

  return { ok: true, value: { date, time, title, link, platforms, comment, imageUrl: imageRaw || null } };
}
