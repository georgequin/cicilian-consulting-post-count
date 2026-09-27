import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/auth";
import { getAccount, saveStat } from "@/lib/db";
import { today } from "@/lib/refresh";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function count(v: unknown): number | null {
  if (v === "" || v == null) return null;
  const n = Number(String(v).replace(/[,\s]/g, ""));
  return Number.isFinite(n) && n >= 0 && n < 1e12 ? Math.round(n) : NaN;
}

/** The editor records today's numbers by hand (for platforms that don't share them). */
export async function POST(req: Request, { params }: Ctx) {
  if (!(await isAdmin())) return NextResponse.json({ error: "Only the editor can update numbers." }, { status: 403 });
  const { id } = await params;
  if (!UUID.test(id) || !(await getAccount(id))) return NextResponse.json({ error: "Account not found." }, { status: 404 });
  const b = ((await req.json().catch(() => null)) ?? {}) as Record<string, unknown>;
  const vals = { followers: count(b.followers), following: count(b.following), likes: count(b.likes), posts: count(b.posts) };
  if (Object.values(vals).some((v) => Number.isNaN(v))) return NextResponse.json({ error: "Numbers only, please (e.g. 1250)." }, { status: 400 });
  if (vals.followers == null) return NextResponse.json({ error: "Add the follower count." }, { status: 400 });
  const date = typeof b.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(b.date) && b.date <= today() ? b.date : today();
  await saveStat(id, { date, ...vals } as never, "manual");
  return NextResponse.json({ account: await getAccount(id) });
}
