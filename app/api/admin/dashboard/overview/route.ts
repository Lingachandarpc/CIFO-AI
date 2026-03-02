export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import prisma from "../../../../../lib/prisma";
import { isSuperAdminRequest } from "../../../../../lib/superAdminAuth";

type UserAggregate = {
  id: number;
  email: string;
  name: string | null;
  tier: string;
  tokenBudget: number;
  tokensUsed: number;
  createdAt: Date;
  chatCount: number;
  tokenRequestCount: number;
  lastActivityAt: Date | null;
};

export async function GET(request: NextRequest) {
  try {
    if (!isSuperAdminRequest(request)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const [users, recentTokenUsage, recentChats] = await prisma.$transaction([
      prisma.user.findMany({
        select: {
          id: true,
          email: true,
          name: true,
          tier: true,
          tokenBudget: true,
          tokensUsed: true,
          createdAt: true,
          _count: {
            select: {
              chatHistory: true,
              tokenUsage: true,
            },
          },
        },
        orderBy: { createdAt: "desc" },
      }),
      prisma.tokenUsageLog.findMany({
        take: 30,
        orderBy: { timestamp: "desc" },
        select: {
          id: true,
          totalTokens: true,
          model: true,
          timestamp: true,
          user: {
            select: {
              id: true,
              email: true,
              name: true,
            },
          },
        },
      }),
      prisma.chatHistory.findMany({
        take: 30,
        orderBy: { timestamp: "desc" },
        select: {
          id: true,
          role: true,
          content: true,
          timestamp: true,
          user: {
            select: {
              id: true,
              email: true,
              name: true,
            },
          },
        },
      }),
    ]);

    const userLatestActivity = new Map<number, Date>();

    for (const row of recentTokenUsage) {
      const current = userLatestActivity.get(row.user.id);
      if (!current || row.timestamp > current) {
        userLatestActivity.set(row.user.id, row.timestamp);
      }
    }

    for (const row of recentChats) {
      const current = userLatestActivity.get(row.user.id);
      if (!current || row.timestamp > current) {
        userLatestActivity.set(row.user.id, row.timestamp);
      }
    }

    const now = Date.now();
    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;

    const userData: UserAggregate[] = users.map((user) => {
      const latest = userLatestActivity.get(user.id) ?? null;
      return {
        id: user.id,
        email: user.email,
        name: user.name,
        tier: user.tier,
        tokenBudget: user.tokenBudget,
        tokensUsed: user.tokensUsed,
        createdAt: user.createdAt,
        chatCount: user._count.chatHistory,
        tokenRequestCount: user._count.tokenUsage,
        lastActivityAt: latest,
      };
    });

    const summary = {
      totalUsers: userData.length,
      totalTokenBudget: userData.reduce((sum, user) => sum + user.tokenBudget, 0),
      totalTokensUsed: userData.reduce((sum, user) => sum + user.tokensUsed, 0),
      activeUsersLast7Days: userData.filter((user) => {
        if (!user.lastActivityAt) return false;
        return now - user.lastActivityAt.getTime() <= sevenDaysMs;
      }).length,
    };

    const recentActivity = [
      ...recentTokenUsage.map((row) => ({
        id: `token-${row.id}`,
        type: "TOKEN_USAGE",
        userId: row.user.id,
        userEmail: row.user.email,
        userName: row.user.name,
        timestamp: row.timestamp,
        details: `${row.totalTokens} tokens on ${row.model}`,
      })),
      ...recentChats.map((row) => ({
        id: `chat-${row.id}`,
        type: row.role === "user" ? "USER_MESSAGE" : "ASSISTANT_MESSAGE",
        userId: row.user.id,
        userEmail: row.user.email,
        userName: row.user.name,
        timestamp: row.timestamp,
        details: row.content.slice(0, 120),
      })),
    ]
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
      .slice(0, 40);

    return NextResponse.json({
      summary,
      users: userData.map((user) => ({
        ...user,
        tokensRemaining: Math.max(0, user.tokenBudget - user.tokensUsed),
        usagePercentage: user.tokenBudget > 0 ? Math.round((user.tokensUsed / user.tokenBudget) * 1000) / 10 : 0,
      })),
      recentActivity,
    });
  } catch (error) {
    console.error("Admin overview API error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
