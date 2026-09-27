import { NextResponse } from "next/server";
import { currentRole, isAdmin } from "@/lib/auth";
import { createAccount, listAccounts } from "@/lib/db";
import { refreshAccount } from "@/lib/refresh";
import { ACCOUNT_PLATFORMS, cleanHandle, profileUrl } from "@/lib/social";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET() {
  if (!(await currentRole())) return NextResponse.json({ error: "Log in to view accounts." }, { status: 401 });
  return NextResponse.json({ accounts: await listAccounts() });
}

export async function POST(req: Request) {
  if (!(await isAdmin())) return NextResponse.json({ error: "Only the editor can add accounts." }, { status: 403 });
  const b = ((await req.json().catch(() => null)) ?? {}) as Record<string, unknown>;
  const platform = typeof b.platform === "string" && (ACCOUNT_PLATFORMS as readonly string[]).includes(b.platform) ? b.platform : "";
  if (!platform) return NextResponse.json({ error: "Pick a platform." }, { status: 400 });
  const handle = cleanHandle(platform, String(b.handle ?? ""));
  if (!handle) return NextResponse.json({ error: "Add the account's handle or profile link." }, { status: 400 });
  const name = String(b.name ?? "").trim().slice(0, 120);
  const rawUrl = String(b.url ?? "").trim();
  const url = /^https?:\/\//.test(rawUrl) ? rawUrl.slice(0, 500) : profileUrl(platform, handle);
  const created = await createAccount({ platform, handle, name, url });
  const { account } = await refreshAccount(created);
  return NextResponse.json({ account: account ?? created }, { status: 201 });
}
