import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/auth";
import { deletePost, getPost, setPreview, updatePost } from "@/lib/db";
import { removeBlob } from "@/lib/blob";
import { buildPreview } from "@/lib/preview";
import { parsePostInput } from "@/lib/validate";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

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
  let post = await updatePost(id, parsed.value);
  if (!post) return NextResponse.json({ error: "Post not found." }, { status: 404 });
  if (before.imageUrl && before.imageUrl !== post.imageUrl) await removeBlob(before.imageUrl);

  const linkChanged = before.link !== post.link;
  const missingPreview = !post.thumbUrl && !post.previewTitle;
  if (linkChanged || (post.link && missingPreview)) {
    const preview = post.link ? await buildPreview(post.link) : null;
    if (preview || linkChanged) {
      post = (await setPreview(id, preview ?? { thumbUrl: null, title: "", author: "" })) ?? post;
      if (before.thumbUrl && before.thumbUrl !== post.thumbUrl) await removeBlob(before.thumbUrl);
    }
  }
  return NextResponse.json({ post });
}

export async function DELETE(_req: Request, { params }: Ctx) {
  if (!(await isAdmin())) return NextResponse.json({ error: "Only the editor can delete posts." }, { status: 403 });
  const { id } = await params;
  if (!UUID.test(id)) return NextResponse.json({ error: "Post not found." }, { status: 404 });
  const removed = await deletePost(id);
  if (!removed) return NextResponse.json({ error: "Post not found." }, { status: 404 });
  await Promise.all([removeBlob(removed.imageUrl), removeBlob(removed.thumbUrl)]);
  return NextResponse.json({ ok: true });
}
