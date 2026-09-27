import { autoStatExists, getAccount, saveStat, updateAccount } from "./db";
import { fetchStats, storeAvatar } from "./social";
import type { Account } from "./types";

/** Today's date in the team's timezone (Lagos), as YYYY-MM-DD. */
export function today(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: process.env.TEAM_TIMEZONE || "Africa/Lagos" });
}

export type RefreshResult = { account: Account | null; fetched: boolean };

export async function refreshAccount(a: Account, opts: { skipIfDone?: boolean } = {}): Promise<RefreshResult> {
  const date = today();
  if (opts.skipIfDone && (await autoStatExists(a.id, date))) return { account: a, fetched: false };
  const s = await fetchStats(a.platform, a.handle, a.url);
  if (!s || s.followers == null || !Number.isFinite(s.followers)) return { account: a, fetched: false };
  const num = (v?: number) => (v == null || !Number.isFinite(v) ? null : v);
  await saveStat(a.id, { date, followers: num(s.followers), following: num(s.following), likes: num(s.likes), posts: num(s.posts) }, "auto");
  const patch: { name?: string; avatarUrl?: string | null } = {};
  if (!a.name && s.name) patch.name = s.name.slice(0, 120);
  if (!a.avatarUrl && s.avatarSrc) patch.avatarUrl = await storeAvatar(s.avatarSrc);
  if (Object.keys(patch).length) await updateAccount(a.id, patch);
  return { account: await getAccount(a.id), fetched: true };
}
