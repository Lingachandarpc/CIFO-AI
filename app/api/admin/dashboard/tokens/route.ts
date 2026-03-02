export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import prisma from "../../../../../lib/prisma";
import { isSuperAdminRequest } from "../../../../../lib/superAdminAuth";

const ALLOWED_TIERS = ["free", "pro", "enterprise"];

export async function POST(request: NextRequest) {
  try {
    if (!isSuperAdminRequest(request)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const userId = Number(body?.userId);
    const additionalTokens = Number(body?.additionalTokens || 0);
    const tier = typeof body?.tier === "string" ? body.tier.trim().toLowerCase() : "";

    if (!Number.isInteger(userId) || userId <= 0) {
      return NextResponse.json({ error: "Valid userId is required" }, { status: 400 });
    }

    if (additionalTokens < 0) {
      return NextResponse.json({ error: "additionalTokens cannot be negative" }, { status: 400 });
    }

    if (tier && !ALLOWED_TIERS.includes(tier)) {
      return NextResponse.json({ error: "Invalid tier" }, { status: 400 });
    }

    if (!tier && additionalTokens === 0) {
      return NextResponse.json({ error: "No changes requested" }, { status: 400 });
    }

    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: {
        ...(additionalTokens > 0 ? { tokenBudget: { increment: additionalTokens } } : {}),
        ...(tier ? { tier } : {}),
      },
      select: {
        id: true,
        email: true,
        name: true,
        tier: true,
        tokenBudget: true,
        tokensUsed: true,
      },
    });

    return NextResponse.json({
      success: true,
      user: {
        ...updatedUser,
        tokensRemaining: Math.max(0, updatedUser.tokenBudget - updatedUser.tokensUsed),
      },
    });
  } catch (error) {
    console.error("Admin token update API error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
