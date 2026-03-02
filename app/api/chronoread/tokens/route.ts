export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "../../../services/authOptions";
import prisma from "../../../../lib/prisma";

// Tier definitions
const TIER_LIMITS: Record<string, number> = {
  free: 50_000,
  pro: 500_000,
  enterprise: 5_000_000,
};

/**
 * GET /api/chronoread/tokens
 * Returns the current user's token usage and budget
 */
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: {
        id: true,
        tokenBudget: true,
        tokensUsed: true,
        tier: true,
        periodStart: true,
      },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Check if billing period needs reset (monthly)
    const now = new Date();
    const periodStart = new Date(user.periodStart);
    const monthsSincePeriodStart =
      (now.getFullYear() - periodStart.getFullYear()) * 12 +
      (now.getMonth() - periodStart.getMonth());

    if (monthsSincePeriodStart >= 1) {
      // Reset tokens for new period
      await prisma.user.update({
        where: { id: user.id },
        data: {
          tokensUsed: 0,
          periodStart: now,
        },
      });
      user.tokensUsed = 0;
    }

    const remaining = Math.max(0, user.tokenBudget - user.tokensUsed);
    const usagePercentage = user.tokenBudget > 0 ? (user.tokensUsed / user.tokenBudget) * 100 : 0;

    // Get recent usage breakdown (last 7 days)
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const recentUsage = await prisma.tokenUsageLog.groupBy({
      by: ["model"],
      where: {
        userId: user.id,
        timestamp: { gte: weekAgo },
      },
      _sum: {
        totalTokens: true,
        estimatedCost: true,
      },
      _count: true,
    });

    return NextResponse.json({
      tier: user.tier,
      tokenBudget: user.tokenBudget,
      tokensUsed: user.tokensUsed,
      tokensRemaining: remaining,
      usagePercentage: Math.round(usagePercentage * 10) / 10,
      periodStart: user.periodStart,
      tierLimits: TIER_LIMITS,
      recentUsage: recentUsage.map((r) => ({
        model: r.model,
        totalTokens: r._sum.totalTokens || 0,
        totalCost: r._sum.estimatedCost || 0,
        requestCount: r._count,
      })),
    });
  } catch (error) {
    console.error("Token usage API error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * POST /api/chronoread/tokens
 * Records token usage for a request (called by AI route after generation)
 */
export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const { model, promptTokens, completionTokens, totalTokens, estimatedCost, queryType } = body;

    if (!totalTokens || totalTokens <= 0) {
      return NextResponse.json({ error: "Invalid token count" }, { status: 400 });
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      select: { id: true, tokenBudget: true, tokensUsed: true, tier: true },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Check if user has budget remaining
    const remaining = user.tokenBudget - user.tokensUsed;
    if (remaining <= 0) {
      return NextResponse.json(
        {
          error: "Token budget exceeded",
          tier: user.tier,
          tokensUsed: user.tokensUsed,
          tokenBudget: user.tokenBudget,
          upgrade: true,
        },
        { status: 429 }
      );
    }

    // Record usage and update user's running total
    await prisma.$transaction([
      prisma.tokenUsageLog.create({
        data: {
          userId: user.id,
          model: model || "unknown",
          promptTokens: promptTokens || 0,
          completionTokens: completionTokens || 0,
          totalTokens,
          estimatedCost: estimatedCost || 0,
          queryType: queryType || "text",
        },
      }),
      prisma.user.update({
        where: { id: user.id },
        data: {
          tokensUsed: { increment: totalTokens },
        },
      }),
    ]);

    const newUsed = user.tokensUsed + totalTokens;
    return NextResponse.json({
      recorded: true,
      tokensUsed: newUsed,
      tokensRemaining: Math.max(0, user.tokenBudget - newUsed),
      usagePercentage: Math.round(((newUsed / user.tokenBudget) * 100) * 10) / 10,
    });
  } catch (error) {
    console.error("Token recording error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
