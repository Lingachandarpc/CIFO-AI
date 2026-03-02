"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type DashboardUser = {
  id: number;
  email: string;
  name: string | null;
  tier: string;
  tokenBudget: number;
  tokensUsed: number;
  tokensRemaining: number;
  usagePercentage: number;
  createdAt: string;
  chatCount: number;
  tokenRequestCount: number;
  lastActivityAt: string | null;
};

type ActivityItem = {
  id: string;
  type: string;
  userId: number;
  userEmail: string;
  userName: string | null;
  details: string;
  timestamp: string;
};

type DashboardData = {
  summary: {
    totalUsers: number;
    totalTokenBudget: number;
    totalTokensUsed: number;
    activeUsersLast7Days: number;
  };
  users: DashboardUser[];
  recentActivity: ActivityItem[];
};

const TIERS = ["free", "pro", "enterprise"];

function formatDateTime(value: string | null): string {
  if (!value) return "-";
  return new Date(value).toLocaleString();
}

function formatNumber(value: number): string {
  return value.toLocaleString();
}

export default function AdminDashboardClient() {
  const router = useRouter();
  const [dashboardData, setDashboardData] = useState<DashboardData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [updatingUserId, setUpdatingUserId] = useState<number | null>(null);
  const [tokenInputs, setTokenInputs] = useState<Record<number, string>>({});
  const [tierInputs, setTierInputs] = useState<Record<number, string>>({});

  const loadDashboard = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);

    try {
      const response = await fetch("/api/admin/dashboard/overview", {
        cache: "no-store",
        credentials: "include",
      });

      if (response.status === 401) {
        router.push("/admin/dashboard/login");
        return;
      }

      if (!response.ok) {
        throw new Error("Failed to load dashboard");
      }

      const data = (await response.json()) as DashboardData;
      setDashboardData(data);

      setTierInputs((current) => {
        const next = { ...current };
        for (const user of data.users) {
          if (!next[user.id]) {
            next[user.id] = user.tier;
          }
        }
        return next;
      });
    } catch {
      setErrorMessage("Unable to load dashboard data");
    } finally {
      setIsLoading(false);
    }
  }, [router]);

  useEffect(() => {
    void loadDashboard();
  }, [loadDashboard]);

  const sortedUsers = useMemo(() => {
    if (!dashboardData?.users) return [];
    return [...dashboardData.users].sort((a, b) => b.tokensUsed - a.tokensUsed);
  }, [dashboardData]);

  const handleLogout = async () => {
    try {
      await fetch("/api/admin/auth/logout", {
        method: "POST",
      });
    } finally {
      router.push("/admin/dashboard/login");
      router.refresh();
    }
  };

  const handleApplyUpdate = async (user: DashboardUser) => {
    const additionalTokens = Number(tokenInputs[user.id] || "0");
    const selectedTier = tierInputs[user.id] || user.tier;

    if (Number.isNaN(additionalTokens) || additionalTokens < 0) {
      setErrorMessage("Additional tokens must be a positive number");
      return;
    }

    setUpdatingUserId(user.id);
    setErrorMessage(null);
    setStatusMessage(null);

    try {
      const response = await fetch("/api/admin/dashboard/tokens", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: user.id,
          additionalTokens,
          tier: selectedTier,
        }),
      });

      if (response.status === 401) {
        router.push("/admin/dashboard/login");
        return;
      }

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body?.error || "Update failed");
      }

      setStatusMessage(`Updated ${user.email}`);
      setTokenInputs((current) => ({ ...current, [user.id]: "" }));
      await loadDashboard();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to update user";
      setErrorMessage(message);
    } finally {
      setUpdatingUserId(null);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background text-foreground px-6 py-10">
        <div className="mx-auto max-w-7xl">Loading super admin dashboard...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground px-6 py-10">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-3xl font-bold">Super Admin Dashboard</h1>
            <p className="text-sm text-(--muted)">Monitor all users, activity, and token allocation.</p>
          </div>
          <button
            type="button"
            onClick={handleLogout}
            className="rounded-xl border border-(--border) bg-(--surface) px-4 py-2 text-sm font-semibold"
          >
            Logout
          </button>
        </div>

        {errorMessage && (
          <div className="rounded-xl border border-(--border) bg-(--surface) px-4 py-2 text-sm">{errorMessage}</div>
        )}
        {statusMessage && (
          <div className="rounded-xl border border-(--border) bg-(--surface) px-4 py-2 text-sm">{statusMessage}</div>
        )}

        {dashboardData && (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-xl border border-(--border) bg-(--surface) p-4">
              <p className="text-xs uppercase tracking-wider text-(--muted)">Total Users</p>
              <p className="mt-2 text-2xl font-bold">{formatNumber(dashboardData.summary.totalUsers)}</p>
            </div>
            <div className="rounded-xl border border-(--border) bg-(--surface) p-4">
              <p className="text-xs uppercase tracking-wider text-(--muted)">Total Budget</p>
              <p className="mt-2 text-2xl font-bold">{formatNumber(dashboardData.summary.totalTokenBudget)}</p>
            </div>
            <div className="rounded-xl border border-(--border) bg-(--surface) p-4">
              <p className="text-xs uppercase tracking-wider text-(--muted)">Tokens Used</p>
              <p className="mt-2 text-2xl font-bold">{formatNumber(dashboardData.summary.totalTokensUsed)}</p>
            </div>
            <div className="rounded-xl border border-(--border) bg-(--surface) p-4">
              <p className="text-xs uppercase tracking-wider text-(--muted)">Active (7 Days)</p>
              <p className="mt-2 text-2xl font-bold">{formatNumber(dashboardData.summary.activeUsersLast7Days)}</p>
            </div>
          </div>
        )}

        <div className="overflow-x-auto rounded-xl border border-(--border) bg-(--surface)">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-(--border) text-xs uppercase tracking-wider text-(--muted)">
              <tr>
                <th className="px-3 py-3">User</th>
                <th className="px-3 py-3">Tier</th>
                <th className="px-3 py-3">Usage</th>
                <th className="px-3 py-3">Requests</th>
                <th className="px-3 py-3">Last Active</th>
                <th className="px-3 py-3">Add Tokens</th>
                <th className="px-3 py-3">Set Tier</th>
                <th className="px-3 py-3">Action</th>
              </tr>
            </thead>
            <tbody>
              {sortedUsers.map((user) => (
                <tr key={user.id} className="border-b border-(--border) align-top">
                  <td className="px-3 py-3">
                    <p className="font-semibold">{user.name || "Unnamed"}</p>
                    <p className="text-xs text-(--muted)">{user.email}</p>
                  </td>
                  <td className="px-3 py-3">{user.tier}</td>
                  <td className="px-3 py-3">
                    <p>{formatNumber(user.tokensUsed)} / {formatNumber(user.tokenBudget)}</p>
                    <p className="text-xs text-(--muted)">{user.usagePercentage}% used</p>
                  </td>
                  <td className="px-3 py-3">
                    <p>AI: {formatNumber(user.tokenRequestCount)}</p>
                    <p className="text-xs text-(--muted)">Chats: {formatNumber(user.chatCount)}</p>
                  </td>
                  <td className="px-3 py-3 text-xs text-(--muted)">{formatDateTime(user.lastActivityAt)}</td>
                  <td className="px-3 py-3">
                    <input
                      type="number"
                      min={0}
                      value={tokenInputs[user.id] ?? ""}
                      onChange={(event) =>
                        setTokenInputs((current) => ({
                          ...current,
                          [user.id]: event.target.value,
                        }))
                      }
                      className="w-28 rounded-lg border border-(--border) bg-background px-2 py-1"
                      placeholder="0"
                    />
                  </td>
                  <td className="px-3 py-3">
                    <select
                      value={tierInputs[user.id] ?? user.tier}
                      onChange={(event) =>
                        setTierInputs((current) => ({
                          ...current,
                          [user.id]: event.target.value,
                        }))
                      }
                      className="rounded-lg border border-(--border) bg-background px-2 py-1"
                    >
                      {TIERS.map((tier) => (
                        <option key={tier} value={tier}>
                          {tier}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-3 py-3">
                    <button
                      type="button"
                      disabled={updatingUserId === user.id}
                      onClick={() => void handleApplyUpdate(user)}
                      className="rounded-lg bg-foreground px-3 py-1 text-xs font-semibold text-background disabled:opacity-50"
                    >
                      {updatingUserId === user.id ? "Saving..." : "Update"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="rounded-xl border border-(--border) bg-(--surface) p-4">
          <h2 className="text-lg font-semibold">Recent Activity</h2>
          <div className="mt-3 space-y-2">
            {dashboardData?.recentActivity?.length ? (
              dashboardData.recentActivity.map((activity) => (
                <div key={activity.id} className="rounded-lg border border-(--border) bg-background px-3 py-2 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-medium">{activity.userName || activity.userEmail}</p>
                    <p className="text-xs text-(--muted)">{formatDateTime(activity.timestamp)}</p>
                  </div>
                  <p className="text-xs text-(--muted)">{activity.type}</p>
                  <p className="mt-1">{activity.details}</p>
                </div>
              ))
            ) : (
              <p className="text-sm text-(--muted)">No activity available yet.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
