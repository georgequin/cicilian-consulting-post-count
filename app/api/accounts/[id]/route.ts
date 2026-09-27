import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/auth";
import { deleteAccount, updateAccount } from "@/lib/db";
import { removeBlob } from "@/lib/blob";
import { cleanHandle, profileUrl } from "@/lib/social";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function PUT(req: Request, { params }: Ctx) {
  if (!(await isAdmin())) return NextResponse.json({ error: "Only the editor can change accounts." }, { status: 403 });
  const { id } = await params;
  if (!UUID.test(id)) return NextResponse.json({ error: "Account not found." }, { status: 404 });
  const b = ((await req.json().catch(() => null)) ?? {}) as Record<string, unknown>;
  const platform = String(b.platform ?? "");
  const handle = cleanHandle(platform, String(b.handle ?? ""));
  if (!handle) return NextResponse.json({ error: "Add the account's handle." }, { status: 400 });
  const rawUrl = String(b.url ?? "").trim();
  const account = await updateAccount(id, {
    handle,
    name: String(b.name ?? "").trim().slice(0, 120),
    url: /^https?:\/\//.test(rawUrl) ? rawUrl.slice(0, 500) : profileUrl(platform, handle),
  });
  if (!account) return NextResponse.json({ error: "Account not found." }, { status: 404 });
  return NextResponse.json({ account });
}

export async function DELETE(_req: Request, { params }: Ctx) {
  if (!(await isAdmin())) return NextResponse.json({ error: "Only the editor can remove accounts." }, { status: 403 });
  const { id } = await params;
  if (!UUID.test(id)) return NextResponse.json({ error: "Account not found." }, { status: 404 });
  const removed = await deleteAccount(id);
  if (!removed) return NextResponse.json({ error: "Account not found." }, { status: 404 });
  await removeBlob(removed.avatarUrl);
  return NextResponse.json({ ok: true });
}
