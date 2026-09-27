import { NextResponse } from "next/server";
import { currentRole, isAdmin } from "@/lib/auth";
import { createPost, listPosts } from "@/lib/db";
import { parsePostInput } from "@/lib/validate";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!(await currentRole())) return NextResponse.json({ error: "Log in to view posts." }, { status: 401 });
  return NextResponse.json({ posts: await listPosts() });
}

export async function POST(req: Request) {
  if (!(await isAdmin())) return NextResponse.json({ error: "Only the editor can log posts." }, { status: 403 });
  const parsed = parsePostInput(await req.json().catch(() => null));
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const post = await createPost(parsed.value);
  return NextResponse.json({ post }, { status: 201 });
}
