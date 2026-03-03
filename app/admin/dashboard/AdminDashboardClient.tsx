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
  serviceLocked: boolean;
  sessionResponseLimit: number | null;
  disabledTools: string[];
  disabledModels: string[];
  createdAt: string;
  chatCount: number;
  tokenRequestCount: number;
  lastActivityAt: string | null;
};

type GlobalPolicy = {
  lockAllUsers: boolean;
  defaultSessionResponseLimit: number | null;
  disabledTools: string[];
  disabledModels: string[];
  enabledModelsByTool: Record<string, string[]>;
  sessionResponseLimitsByTool: Record<string, number>;
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
  globalPolicy: GlobalPolicy;
  users: DashboardUser[];
  recentActivity: ActivityItem[];
};

const TIERS = ["free", "pro", "enterprise"];
const TOOL_OPTIONS = ["text", "listen", "image", "video", "ocr", "document", "dashboard"];
const MODEL_GATED_TOOLS = ["text", "listen", "image", "video", "document"];

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
  const [lockInputs, setLockInputs] = useState<Record<number, boolean>>({});
  const [sessionLimitInputs, setSessionLimitInputs] = useState<Record<number, string>>({});
  const [disabledToolsInputs, setDisabledToolsInputs] = useState<Record<number, string>>({});
  const [disabledModelsInputs, setDisabledModelsInputs] = useState<Record<number, string>>({});
  const [globalPolicy, setGlobalPolicy] = useState<GlobalPolicy>({
    lockAllUsers: false,
    defaultSessionResponseLimit: null,
    disabledTools: [],
    disabledModels: [],
    enabledModelsByTool: {},
    sessionResponseLimitsByTool: {},
  });
  const [globalSessionLimitInput, setGlobalSessionLimitInput] = useState<string>("");
  const [globalDisabledModelsInput, setGlobalDisabledModelsInput] = useState<string>("");
  const [globalEnabledModelsByToolInputs, setGlobalEnabledModelsByToolInputs] = useState<Record<string, string>>({});
  const [globalSessionLimitsByToolInputs, setGlobalSessionLimitsByToolInputs] = useState<Record<string, string>>({});
  const [isSavingGlobalPolicy, setIsSavingGlobalPolicy] = useState(false);

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
      if (data.globalPolicy) {
        setGlobalPolicy(data.globalPolicy);
        setGlobalSessionLimitInput(
          typeof data.globalPolicy.defaultSessionResponseLimit === "number"
            ? String(data.globalPolicy.defaultSessionResponseLimit)
            : ""
        );
        setGlobalDisabledModelsInput((data.globalPolicy.disabledModels || []).join(", "));
        const nextEnabledInputs: Record<string, string> = {};
        for (const tool of MODEL_GATED_TOOLS) {
          nextEnabledInputs[tool] = (data.globalPolicy.enabledModelsByTool?.[tool] || []).join(", ");
        }
        setGlobalEnabledModelsByToolInputs(nextEnabledInputs);

        const nextSessionLimitInputs: Record<string, string> = {};
        for (const tool of TOOL_OPTIONS) {
          const rawLimit = data.globalPolicy.sessionResponseLimitsByTool?.[tool];
          nextSessionLimitInputs[tool] = Number.isInteger(rawLimit) ? String(rawLimit) : "";
        }
        setGlobalSessionLimitsByToolInputs(nextSessionLimitInputs);
      }

      setTierInputs((current) => {
        const next = { ...current };
        for (const user of data.users) {
          if (!next[user.id]) {
            next[user.id] = user.tier;
          }
        }
        return next;
      });

      setLockInputs((current) => {
        const next = { ...current };
        for (const user of data.users) {
          if (next[user.id] === undefined) {
            next[user.id] = user.serviceLocked;
          }
        }
        return next;
      });

      setSessionLimitInputs((current) => {
        const next = { ...current };
        for (const user of data.users) {
          if (next[user.id] === undefined) {
            next[user.id] = user.sessionResponseLimit === null ? "" : String(user.sessionResponseLimit);
          }
        }
        return next;
      });

      setDisabledToolsInputs((current) => {
        const next = { ...current };
        for (const user of data.users) {
          if (next[user.id] === undefined) {
            next[user.id] = (user.disabledTools || []).join(", ");
          }
        }
        return next;
      });

      setDisabledModelsInputs((current) => {
        const next = { ...current };
        for (const user of data.users) {
          if (next[user.id] === undefined) {
            next[user.id] = (user.disabledModels || []).join(", ");
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
    const serviceLocked = lockInputs[user.id] ?? user.serviceLocked;
    const sessionLimitRaw = sessionLimitInputs[user.id] ?? (user.sessionResponseLimit === null ? "" : String(user.sessionResponseLimit));
    const disabledToolsRaw = disabledToolsInputs[user.id] ?? (user.disabledTools || []).join(", ");
    const disabledModelsRaw = disabledModelsInputs[user.id] ?? (user.disabledModels || []).join(", ");

    const sessionResponseLimit = sessionLimitRaw.trim() === "" ? null : Number(sessionLimitRaw);
    const disabledTools = disabledToolsRaw
      .split(",")
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean)
      .filter((value, index, list) => list.indexOf(value) === index);
    const disabledModels = disabledModelsRaw
      .split(",")
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean)
      .filter((value, index, list) => list.indexOf(value) === index);

    if (Number.isNaN(additionalTokens) || additionalTokens < 0) {
      setErrorMessage("Additional tokens must be a positive number");
      return;
    }

    if (sessionResponseLimit !== null && (!Number.isInteger(sessionResponseLimit) || sessionResponseLimit < 0)) {
      setErrorMessage("Session response limit must be a non-negative integer or empty");
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
          serviceLocked,
          sessionResponseLimit,
          disabledTools,
          disabledModels,
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

  const handleGlobalPolicySave = async () => {
    setIsSavingGlobalPolicy(true);
    setErrorMessage(null);
    setStatusMessage(null);

    try {
      const defaultSessionResponseLimit = globalSessionLimitInput.trim() === ""
        ? null
        : Number(globalSessionLimitInput);

      if (
        defaultSessionResponseLimit !== null &&
        (!Number.isInteger(defaultSessionResponseLimit) || defaultSessionResponseLimit < 0)
      ) {
        setErrorMessage("Global session response limit must be a non-negative integer or empty");
        return;
      }

      const disabledModels = globalDisabledModelsInput
        .split(",")
        .map((value) => value.trim().toLowerCase())
        .filter(Boolean)
        .filter((value, index, list) => list.indexOf(value) === index);

      const enabledModelsByTool = Object.fromEntries(
        MODEL_GATED_TOOLS.map((tool) => {
          const raw = globalEnabledModelsByToolInputs[tool] || "";
          const normalized = raw
            .split(",")
            .map((value) => value.trim().toLowerCase())
            .filter(Boolean)
            .filter((value, index, list) => list.indexOf(value) === index);
          return [tool, normalized];
        })
      );

      const sessionResponseLimitsByTool = Object.fromEntries(
        TOOL_OPTIONS.map((tool) => {
          const raw = String(globalSessionLimitsByToolInputs[tool] || "").trim();
          if (!raw) return [tool, null];
          const parsed = Number(raw);
          if (!Number.isInteger(parsed) || parsed < 0) {
            throw new Error(`Per-tool session limit for \"${tool}\" must be a non-negative integer or empty`);
          }
          return [tool, parsed];
        }).filter(([, value]) => typeof value === "number")
      ) as Record<string, number>;

      const response = await fetch("/api/admin/dashboard/policies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lockAllUsers: globalPolicy.lockAllUsers,
          defaultSessionResponseLimit,
          disabledTools: globalPolicy.disabledTools,
          disabledModels,
          enabledModelsByTool,
          sessionResponseLimitsByTool,
        }),
      });

      if (response.status === 401) {
        router.push("/admin/dashboard/login");
        return;
      }

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body?.error || "Failed to save global policy");
      }

      setStatusMessage("Global policy updated");
      await loadDashboard();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to save global policy");
    } finally {
      setIsSavingGlobalPolicy(false);
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

        <div className="rounded-xl border border-(--border) bg-(--surface) p-4 space-y-3">
          <div>
            <h2 className="text-lg font-semibold">Global AI Access Policy</h2>
            <p className="text-xs text-(--muted)">Apply restrictions to every user account.</p>
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={globalPolicy.lockAllUsers}
              onChange={(event) =>
                setGlobalPolicy((current) => ({
                  ...current,
                  lockAllUsers: event.target.checked,
                }))
              }
            />
            Lock all users from every AI service
          </label>

          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <label className="text-xs uppercase tracking-wide text-(--muted)">Default responses per session</label>
              <input
                type="number"
                min={0}
                value={globalSessionLimitInput}
                onChange={(event) => setGlobalSessionLimitInput(event.target.value)}
                placeholder="Unlimited"
                className="mt-1 w-full rounded-lg border border-(--border) bg-background px-2 py-1"
              />
            </div>

            <div>
              <label className="text-xs uppercase tracking-wide text-(--muted)">Disable tools globally</label>
              <div className="mt-2 flex flex-wrap gap-2">
                {TOOL_OPTIONS.map((tool) => {
                  const active = globalPolicy.disabledTools.includes(tool);
                  return (
                    <button
                      key={tool}
                      type="button"
                      onClick={() =>
                        setGlobalPolicy((current) => ({
                          ...current,
                          disabledTools: active
                            ? current.disabledTools.filter((value) => value !== tool)
                            : [...current.disabledTools, tool],
                        }))
                      }
                      className={`rounded-full border px-2 py-1 text-xs ${
                        active ? "border-foreground bg-foreground text-background" : "border-(--border)"
                      }`}
                    >
                      {tool}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <div>
            <label className="text-xs uppercase tracking-wide text-(--muted)">Disable models globally (comma-separated model ids)</label>
            <input
              type="text"
              value={globalDisabledModelsInput}
              onChange={(event) => setGlobalDisabledModelsInput(event.target.value)}
              placeholder="gpt-4, gemini-flash"
              className="mt-1 w-full rounded-lg border border-(--border) bg-background px-2 py-1"
            />
          </div>

          <div>
            <label className="text-xs uppercase tracking-wide text-(--muted)">Enable models per tool (comma-separated model ids)</label>
            <div className="mt-2 grid gap-2 md:grid-cols-2">
              {MODEL_GATED_TOOLS.map((tool) => (
                <div key={`enabled-models-${tool}`}>
                  <label className="text-[10px] uppercase tracking-wide text-(--muted)">{tool}</label>
                  <input
                    type="text"
                    value={globalEnabledModelsByToolInputs[tool] || ""}
                    onChange={(event) =>
                      setGlobalEnabledModelsByToolInputs((current) => ({
                        ...current,
                        [tool]: event.target.value,
                      }))
                    }
                    placeholder={tool === "image" ? "gemini-2.5-flash-image, imagen-4.0-generate-001" : "auto or model ids"}
                    className="mt-1 w-full rounded-lg border border-(--border) bg-background px-2 py-1 text-xs"
                  />
                </div>
              ))}
            </div>
          </div>

          <div>
            <label className="text-xs uppercase tracking-wide text-(--muted)">Responses per session by tool (leave empty to use default)</label>
            <div className="mt-2 grid gap-2 md:grid-cols-3">
              {TOOL_OPTIONS.map((tool) => (
                <div key={`session-limit-${tool}`}>
                  <label className="text-[10px] uppercase tracking-wide text-(--muted)">{tool}</label>
                  <input
                    type="number"
                    min={0}
                    value={globalSessionLimitsByToolInputs[tool] || ""}
                    onChange={(event) =>
                      setGlobalSessionLimitsByToolInputs((current) => ({
                        ...current,
                        [tool]: event.target.value,
                      }))
                    }
                    placeholder="Use default"
                    className="mt-1 w-full rounded-lg border border-(--border) bg-background px-2 py-1 text-xs"
                  />
                </div>
              ))}
            </div>
          </div>

          <button
            type="button"
            onClick={() => void handleGlobalPolicySave()}
            disabled={isSavingGlobalPolicy}
            className="rounded-lg bg-foreground px-3 py-1.5 text-xs font-semibold text-background disabled:opacity-50"
          >
            {isSavingGlobalPolicy ? "Saving..." : "Save Global Policy"}
          </button>
        </div>

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
                <th className="px-3 py-3">Lock</th>
                <th className="px-3 py-3">Resp/Session</th>
                <th className="px-3 py-3">Disable Tools</th>
                <th className="px-3 py-3">Disable Models</th>
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
                    <label className="inline-flex items-center gap-2 text-xs">
                      <input
                        type="checkbox"
                        checked={lockInputs[user.id] ?? user.serviceLocked}
                        onChange={(event) =>
                          setLockInputs((current) => ({
                            ...current,
                            [user.id]: event.target.checked,
                          }))
                        }
                      />
                      Locked
                    </label>
                  </td>
                  <td className="px-3 py-3">
                    <input
                      type="number"
                      min={0}
                      value={sessionLimitInputs[user.id] ?? (user.sessionResponseLimit === null ? "" : String(user.sessionResponseLimit))}
                      onChange={(event) =>
                        setSessionLimitInputs((current) => ({
                          ...current,
                          [user.id]: event.target.value,
                        }))
                      }
                      className="w-28 rounded-lg border border-(--border) bg-background px-2 py-1"
                      placeholder="Unlimited"
                    />
                  </td>
                  <td className="px-3 py-3">
                    <input
                      type="text"
                      value={disabledToolsInputs[user.id] ?? (user.disabledTools || []).join(", ")}
                      onChange={(event) =>
                        setDisabledToolsInputs((current) => ({
                          ...current,
                          [user.id]: event.target.value,
                        }))
                      }
                      className="w-48 rounded-lg border border-(--border) bg-background px-2 py-1"
                      placeholder="image, video"
                    />
                  </td>
                  <td className="px-3 py-3">
                    <input
                      type="text"
                      value={disabledModelsInputs[user.id] ?? (user.disabledModels || []).join(", ")}
                      onChange={(event) =>
                        setDisabledModelsInputs((current) => ({
                          ...current,
                          [user.id]: event.target.value,
                        }))
                      }
                      className="w-56 rounded-lg border border-(--border) bg-background px-2 py-1"
                      placeholder="gpt-4, gemini-flash"
                    />
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
