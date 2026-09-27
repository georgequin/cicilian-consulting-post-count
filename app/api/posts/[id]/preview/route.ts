import { NextResponse } from "next/server";
import { isAdmin } from "@/lib/auth";
import { getPost, setPreview } from "@/lib/db";
import { removeBlob } from "@/lib/blob";
import { buildPreview } from "@/lib/preview";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

type Ctx = { params: Promise<{ id: string }> };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Re-fetches the thumbnail and caption from the post's link. */
export async function POST(_req: Request, { params }: Ctx) {
  if (!(await isAdmin())) return NextResponse.json({ error: "Only the editor can refresh previews." }, { status: 403 });
  const { id } = await params;
  if (!UUID.test(id)) return NextResponse.json({ error: "Post not found." }, { status: 404 });
  const before = await getPost(id);
  if (!before) return NextResponse.json({ error: "Post not found." }, { status: 404 });
  if (!before.link) return NextResponse.json({ error: "Add a link to fetch a preview." }, { status: 400 });

  const preview = await buildPreview(before.link);
  if (!preview)
    return NextResponse.json({ error: "That site didn't share a preview. Add a screenshot instead." }, { status: 422 });
  const post = await setPreview(id, preview);
  if (before.thumbUrl && before.thumbUrl !== post?.thumbUrl) await removeBlob(before.thumbUrl);
  return NextResponse.json({ post });
}
