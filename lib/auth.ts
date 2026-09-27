import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import type { Role } from "./types";

export const COOKIE = "cpl_session";
const MAX_AGE_S = 60 * 60 * 24 * 30; // 30 days

function secret(): string {
  const s = process.env.SESSION_SECRET;
  if (s && s.length >= 16) return s;
  // Fallback so a first deploy still works; setting SESSION_SECRET is recommended.
  const admin = process.env.ADMIN_PASSWORD ?? "";
  return createHash("sha256").update("cpl:" + admin).digest("hex");
}

function sign(payload: string): string {
  return createHmac("sha256", secret()).update(payload).digest("base64url");
}

function safeEqual(a: string, b: string): boolean {
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();
  return timingSafeEqual(ha, hb);
}

export function adminConfigured(): boolean {
  return Boolean(process.env.ADMIN_PASSWORD);
}

/** True when viewing needs a password. Without VIEW_PASSWORD, anyone with the link can read. */
export function viewLocked(): boolean {
  return Boolean(process.env.VIEW_PASSWORD);
}

export function roleForPassword(pw: string): Role | null {
  const admin = process.env.ADMIN_PASSWORD;
  const view = process.env.VIEW_PASSWORD;
  if (admin && safeEqual(pw, admin)) return "admin";
  if (view && safeEqual(pw, view)) return "viewer";
  return null;
}

export function makeToken(role: Role): string {
  const exp = Math.floor(Date.now() / 1000) + MAX_AGE_S;
  const payload = `${role}.${exp}`;
  return `${payload}.${sign(payload)}`;
}

function verify(token: string | undefined): Role | null {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [role, exp, sig] = parts;
  if (role !== "admin" && role !== "viewer") return null;
  if (!safeEqual(sig, sign(`${role}.${exp}`))) return null;
  if (Number(exp) < Date.now() / 1000) return null;
  return role;
}

/** The signed-in role, or "viewer" for everyone when the log is not view-locked. */
export async function currentRole(): Promise<Role | null> {
  const jar = await cookies();
  const role = verify(jar.get(COOKIE)?.value);
  if (role) return role;
  return viewLocked() ? null : "viewer";
}

export async function isAdmin(): Promise<boolean> {
  const jar = await cookies();
  return verify(jar.get(COOKIE)?.value) === "admin";
}

export const cookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
  maxAge: MAX_AGE_S,
};
