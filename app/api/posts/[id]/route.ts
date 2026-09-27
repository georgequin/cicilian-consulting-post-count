import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/auth";
import { deletePost, getPost, updatePost } from "@/lib/db";
import { removeBlob } from "@/lib/blob";
import { parsePostInput } from "@/lib/validate";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function PUT(req: Request, { params }: Ctx) {
  if (!(await isAdmin())) return NextResponse.json({ error: "Only the editor can change posts." }, { status: 403 });
  const { id } = await params;
  if (!UUID.test(id)) return NextResponse.json({ error: "Post not found." }, { status: 404 });
  const parsed = parsePostInput(await req.json().catch(() => null));
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const before = await getPost(id);
  if (!before) return NextResponse.json({ error: "Post not found." }, { status: 404 });
  const post = await updatePost(id, parsed.value);
  if (before.imageUrl && before.imageUrl !== post?.imageUrl) await removeBlob(before.imageUrl);
  return NextResponse.json({ post });
}

export async function DELETE(_req: Request, { params }: Ctx) {
  if (!(await isAdmin())) return NextResponse.json({ error: "Only the editor can delete posts." }, { status: 403 });
  const { id } = await params;
  if (!UUID.test(id)) return NextResponse.json({ error: "Post not found." }, { status: 404 });
  const removed = await deletePost(id);
  if (!removed) return NextResponse.json({ error: "Post not found." }, { status: 404 });
  await removeBlob(removed.imageUrl);
  return NextResponse.json({ ok: true });
}
