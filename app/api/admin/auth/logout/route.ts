export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { clearSuperAdminCookie } from "../../../../../lib/superAdminAuth";

export async function POST() {
  const response = NextResponse.json({ success: true });
  return clearSuperAdminCookie(response);
}
