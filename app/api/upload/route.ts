import { NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { randomUUID } from "node:crypto";
import { isAdmin } from "@/lib/auth";
import { uploadsEnabled } from "@/lib/blob";

export const dynamic = "force-dynamic";

const MAX_BYTES = 4 * 1024 * 1024; // Vercel functions accept request bodies up to ~4.5 MB
const TYPES: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

export async function POST(req: Request) {
  if (!(await isAdmin())) return NextResponse.json({ error: "Only the editor can upload screenshots." }, { status: 403 });
  if (!uploadsEnabled())
    return NextResponse.json({ error: "Screenshot storage isn't set up yet. Connect a Vercel Blob store." }, { status: 501 });

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "Choose an image to upload." }, { status: 400 });
  const ext = TYPES[file.type];
  if (!ext) return NextResponse.json({ error: "Use a JPG, PNG or WebP image." }, { status: 415 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: "That image is too large (4 MB max)." }, { status: 413 });

  const blob = await put(`screenshots/${randomUUID()}.${ext}`, file, {
    access: "public",
    contentType: file.type,
  });
  return NextResponse.json({ url: blob.url }, { status: 201 });
}
