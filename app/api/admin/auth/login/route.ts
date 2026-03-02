export const runtime = "nodejs";

import { NextResponse } from "next/server";
import {
  attachSuperAdminCookie,
  createSuperAdminSessionToken,
  validateSuperAdminCredentials,
} from "../../../../../lib/superAdminAuth";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const username = typeof body?.username === "string" ? body.username.trim() : "";
    const password = typeof body?.password === "string" ? body.password : "";

    if (!validateSuperAdminCredentials(username, password)) {
      return NextResponse.json({ error: "Invalid username or password" }, { status: 401 });
    }

    const sessionToken = createSuperAdminSessionToken();
    const response = NextResponse.json({ success: true });
    return attachSuperAdminCookie(response, sessionToken);
  } catch (error) {
    console.error("Super admin login error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
