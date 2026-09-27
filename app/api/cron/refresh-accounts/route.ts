import { NextResponse } from "next/server";
import { listAccounts } from "@/lib/db";
import { refreshAccount } from "@/lib/refresh";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Runs daily from vercel.json. Records one automatic snapshot per account per day and skips
 * accounts already done today, so extra calls are harmless. If CRON_SECRET is set, Vercel's
 * scheduler sends it and anything without it is refused.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`)
    return NextResponse.json({ error: "Not allowed." }, { status: 401 });
  const results: Record<string, boolean> = {};
  for (const a of await listAccounts()) {
    const { fetched } = await refreshAccount(a, { skipIfDone: true }).catch(() => ({ fetched: false }));
    results[`${a.platform}:${a.handle}`] = fetched;
  }
  return NextResponse.json({ ok: true, results });
}
