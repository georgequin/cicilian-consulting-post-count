import { NextResponse } from "next/server";
import { COOKIE, cookieOptions, makeToken, roleForPassword } from "@/lib/auth";

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { password?: unknown } | null;
  const password = typeof body?.password === "string" ? body.password : "";
  const role = password ? roleForPassword(password) : null;
  if (!role) {
    await new Promise((r) => setTimeout(r, 600)); // slow down guessing
    return NextResponse.json({ error: "That password isn't right." }, { status: 401 });
  }
  const res = NextResponse.json({ role });
  res.cookies.set(COOKIE, makeToken(role), cookieOptions);
  return res;
}
