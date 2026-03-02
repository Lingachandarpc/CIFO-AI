import crypto from "crypto";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

const SUPER_ADMIN_USERNAME = "linga";
const SUPER_ADMIN_PASSWORD = "Linga#0112";
const SUPER_ADMIN_COOKIE_NAME = "chronoread_super_admin";
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 8;

function getSessionSecret(): string {
  return process.env.SUPER_ADMIN_SESSION_SECRET || "chronoread-super-admin-secret";
}

function signSessionPayload(payloadBase64: string): string {
  return crypto.createHmac("sha256", getSessionSecret()).update(payloadBase64).digest("hex");
}

export function validateSuperAdminCredentials(username: string, password: string): boolean {
  return username === SUPER_ADMIN_USERNAME && password === SUPER_ADMIN_PASSWORD;
}

export function createSuperAdminSessionToken(): string {
  const payload = {
    username: SUPER_ADMIN_USERNAME,
    exp: Date.now() + SESSION_MAX_AGE_SECONDS * 1000,
  };

  const payloadBase64 = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const signature = signSessionPayload(payloadBase64);
  return `${payloadBase64}.${signature}`;
}

export function verifySuperAdminSessionToken(token?: string | null): boolean {
  if (!token) return false;

  const [payloadBase64, signature] = token.split(".");
  if (!payloadBase64 || !signature) return false;

  const expectedSignature = signSessionPayload(payloadBase64);
  if (signature !== expectedSignature) return false;

  try {
    const payloadJson = Buffer.from(payloadBase64, "base64url").toString("utf8");
    const payload = JSON.parse(payloadJson) as { username?: string; exp?: number };
    if (payload.username !== SUPER_ADMIN_USERNAME) return false;
    if (!payload.exp || Date.now() > payload.exp) return false;
    return true;
  } catch {
    return false;
  }
}

export function attachSuperAdminCookie(response: NextResponse, token: string): NextResponse {
  response.cookies.set({
    name: SUPER_ADMIN_COOKIE_NAME,
    value: token,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });

  return response;
}

export function clearSuperAdminCookie(response: NextResponse): NextResponse {
  response.cookies.set({
    name: SUPER_ADMIN_COOKIE_NAME,
    value: "",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });

  return response;
}

export function isSuperAdminRequest(request: NextRequest): boolean {
  const token = request.cookies.get(SUPER_ADMIN_COOKIE_NAME)?.value;
  return verifySuperAdminSessionToken(token);
}

export async function isSuperAdminServerSession(): Promise<boolean> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SUPER_ADMIN_COOKIE_NAME)?.value;
  return verifySuperAdminSessionToken(token);
}
