import { NextResponse } from "next/server";
import { currentRole, isAdmin } from "@/lib/auth";
import { createPost, listPosts, setPreview } from "@/lib/db";
import { buildPreview } from "@/lib/preview";
import { parsePostInput } from "@/lib/validate";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function GET() {
  if (!(await currentRole())) return NextResponse.json({ error: "Log in to view posts." }, { status: 401 });
  return NextResponse.json({ posts: await listPosts() });
}

export async function POST(req: Request) {
  if (!(await isAdmin())) return NextResponse.json({ error: "Only the editor can log posts." }, { status: 403 });
  const parsed = parsePostInput(await req.json().catch(() => null));
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  let post = await createPost(parsed.value);
  if (post.link) {
    const preview = await buildPreview(post.link);
    if (preview) post = (await setPreview(post.id, preview)) ?? post;
  }
  return NextResponse.json({ post }, { status: 201 });
}
