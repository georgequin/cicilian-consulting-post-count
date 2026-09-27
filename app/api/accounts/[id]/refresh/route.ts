import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/auth";
import { getAccount } from "@/lib/db";
import { refreshAccount } from "@/lib/refresh";

export const dynamic = "force-dynamic";
export const maxDuration = 30;
type Ctx = { params: Promise<{ id: string }> };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(_req: Request, { params }: Ctx) {
  if (!(await isAdmin())) return NextResponse.json({ error: "Only the editor can refresh numbers." }, { status: 403 });
  const { id } = await params;
  const a = UUID.test(id) ? await getAccount(id) : null;
  if (!a) return NextResponse.json({ error: "Account not found." }, { status: 404 });
  const { account, fetched } = await refreshAccount(a);
  if (!fetched)
    return NextResponse.json({ error: `${a.platform} didn't share its numbers just now. Enter them by hand.`, account }, { status: 422 });
  return NextResponse.json({ account });
}
