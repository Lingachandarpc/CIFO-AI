import { NextResponse } from "next/server";
import prisma from "./prisma";

export type EffectiveUsagePolicy = {
  userId: number;
  userEmail: string;
  locked: boolean;
  sessionResponseLimit: number | null;
  sessionResponseLimitsByTool: Record<string, number>;
  sessionResponsesUsed: number;
  sessionResponsesRemaining: number | null;
  disabledTools: string[];
  disabledModels: string[];
  enabledModelsByTool: Record<string, string[]>;
  globalLockApplied: boolean;
  userLockApplied: boolean;
};

const AUTH_SESSION_COOKIE_KEYS = [
  "next-auth.session-token",
  "__Secure-next-auth.session-token",
];

const SESSION_LIMITS_BY_TOOL_META_KEY = "__sessionResponseLimitsByTool";

function parseCookieHeader(cookieHeader?: string | null): Record<string, string> {
  if (!cookieHeader) return {};
  const cookies: Record<string, string> = {};
  for (const pair of cookieHeader.split(";")) {
    const [rawKey, ...rawValue] = pair.trim().split("=");
    if (!rawKey) continue;
    cookies[rawKey] = decodeURIComponent(rawValue.join("=") || "");
  }
  return cookies;
}

function extractSessionTokenFromRequest(request: Request): string | null {
  const cookies = parseCookieHeader(request.headers.get("cookie"));
  for (const key of AUTH_SESSION_COOKIE_KEYS) {
    if (cookies[key]) return cookies[key];
  }
  return null;
}

function normalizeStringArray(values?: string[] | null): string[] {
  if (!Array.isArray(values)) return [];
  return values
    .map((value) => String(value || "").trim().toLowerCase())
    .filter(Boolean)
    .filter((value, index, list) => list.indexOf(value) === index);
}

function normalizeEnabledModelsByTool(value: unknown): Record<string, string[]> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  const normalized: Record<string, string[]> = {};
  for (const [rawTool, rawModels] of Object.entries(value as Record<string, unknown>)) {
    if (rawTool === SESSION_LIMITS_BY_TOOL_META_KEY) continue;
    const toolKey = String(rawTool || "").trim().toLowerCase();
    const tool = toolKey === "read" ? "text" : toolKey;
    if (!tool) continue;
    if (tool === "ocr" || tool === "dashboard") continue;
    if (!Array.isArray(rawModels)) continue;

    const models = rawModels
      .map((entry) => String(entry || "").trim().toLowerCase())
      .filter(Boolean)
      .filter((entry, index, list) => list.indexOf(entry) === index);

    normalized[tool] = models;
  }

  return normalized;
}

function normalizeSessionResponseLimitsByTool(value: unknown): Record<string, number> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  const objectValue = value as Record<string, unknown>;
  const rawLimits = objectValue[SESSION_LIMITS_BY_TOOL_META_KEY];
  if (!rawLimits || typeof rawLimits !== "object" || Array.isArray(rawLimits)) {
    return {};
  }

  const normalized: Record<string, number> = {};
  for (const [rawTool, rawLimit] of Object.entries(rawLimits as Record<string, unknown>)) {
    const toolKey = String(rawTool || "").trim().toLowerCase();
    const tool = toolKey === "read" ? "text" : toolKey;
    if (!tool) continue;

    const numericLimit = Number(rawLimit);
    if (!Number.isInteger(numericLimit) || numericLimit < 0) continue;

    normalized[tool] = numericLimit;
  }

  return normalized;
}

function getToolAliases(tool: string): string[] {
  const normalized = String(tool || "").trim().toLowerCase();
  const aliases = new Set<string>([normalized]);

  if (normalized === "read" || normalized === "listen") aliases.add("text");
  if (normalized === "text") {
    aliases.add("read");
    aliases.add("listen");
  }

  return Array.from(aliases).filter(Boolean);
}

function getEnabledModelsForTool(policy: EffectiveUsagePolicy, toolType: string): string[] | null {
  const normalizedTool = String(toolType || "").trim().toLowerCase();
  if (normalizedTool === "ocr" || normalizedTool === "dashboard") {
    return null;
  }

  const toolAliases = getToolAliases(toolType);
  for (const alias of toolAliases) {
    if (Object.prototype.hasOwnProperty.call(policy.enabledModelsByTool, alias)) {
      return policy.enabledModelsByTool[alias] || [];
    }
  }
  return null;
}

function getSessionResponseLimitForTool(policy: EffectiveUsagePolicy, toolType?: string | null): number | null {
  const normalizedTool = String(toolType || "").trim().toLowerCase();
  if (!normalizedTool) return policy.sessionResponseLimit;

  const toolAliases = getToolAliases(normalizedTool);
  for (const alias of toolAliases) {
    if (Object.prototype.hasOwnProperty.call(policy.sessionResponseLimitsByTool, alias)) {
      return policy.sessionResponseLimitsByTool[alias];
    }
  }

  return policy.sessionResponseLimit;
}

function getModelAliases(modelId: string): string[] {
  const normalized = String(modelId || "").trim().toLowerCase();
  if (!normalized) return [];

  const aliases = new Set<string>([normalized]);
  const aliasGroups: string[][] = [
    ["gemini-flash", "gemini-1.5-flash", "gemini-2.5-flash"],
    ["gemini-pro", "gemini-1.5-pro"],
    ["gpt-3.5", "gpt-3.5-turbo"],
    ["gpt-4", "gpt-4-turbo"],
    ["claude-opus", "claude-3-opus"],
    ["claude-sonnet", "claude-3-sonnet"],
    ["claude-haiku", "claude-3-haiku"],
    ["grok-1", "grok-3"],
  ];

  for (const group of aliasGroups) {
    if (group.includes(normalized)) {
      group.forEach((alias) => aliases.add(alias));
    }
  }

  return Array.from(aliases);
}

async function getOrCreateGlobalPolicy() {
  const existing = await prisma.globalUsagePolicy.findFirst({
    orderBy: { id: "asc" },
  });

  if (existing) return existing;

  return prisma.globalUsagePolicy.create({
    data: {
      lockAllUsers: false,
      disabledTools: [],
      disabledModels: [],
      enabledModelsByTool: {},
    },
  });
}

export async function getEffectiveUsagePolicyForUserEmail(
  request: Request,
  userEmail: string
): Promise<EffectiveUsagePolicy | null> {
  const [user, globalPolicy] = await Promise.all([
    prisma.user.findUnique({
      where: { email: userEmail },
      select: {
        id: true,
        email: true,
        serviceLocked: true,
        sessionResponseLimit: true,
        disabledTools: true,
        disabledModels: true,
      },
    }),
    getOrCreateGlobalPolicy(),
  ]);

  if (!user) return null;

  const sessionToken = extractSessionTokenFromRequest(request);
  let sessionResponsesUsed = 0;

  if (sessionToken) {
    const sessionRecord = await prisma.session.findUnique({
      where: { sessionToken },
      select: { userId: true, aiResponsesUsed: true },
    });

    if (sessionRecord?.userId === user.id) {
      sessionResponsesUsed = sessionRecord.aiResponsesUsed;
    }
  }

  const disabledTools = normalizeStringArray([
    ...(globalPolicy.disabledTools || []),
    ...(user.disabledTools || []),
  ]);
  const disabledModels = normalizeStringArray([
    ...(globalPolicy.disabledModels || []),
    ...(user.disabledModels || []),
  ]);
  const enabledModelsByTool = normalizeEnabledModelsByTool(globalPolicy.enabledModelsByTool);
  const sessionResponseLimitsByTool = normalizeSessionResponseLimitsByTool(globalPolicy.enabledModelsByTool);

  const sessionResponseLimit = user.sessionResponseLimit ?? globalPolicy.defaultSessionResponseLimit ?? null;
  const sessionResponsesRemaining = sessionResponseLimit === null
    ? null
    : Math.max(0, sessionResponseLimit - sessionResponsesUsed);

  return {
    userId: user.id,
    userEmail: user.email,
    locked: Boolean(globalPolicy.lockAllUsers || user.serviceLocked),
    sessionResponseLimit,
    sessionResponseLimitsByTool,
    sessionResponsesUsed,
    sessionResponsesRemaining,
    disabledTools,
    disabledModels,
    enabledModelsByTool,
    globalLockApplied: Boolean(globalPolicy.lockAllUsers),
    userLockApplied: Boolean(user.serviceLocked),
  };
}

export async function enforceUsagePolicy(args: {
  request: Request;
  userEmail: string;
  toolType?: string | null;
  modelId?: string | null;
}): Promise<{ allowed: true; policy: EffectiveUsagePolicy | null } | { allowed: false; response: NextResponse; policy: EffectiveUsagePolicy | null }> {
  const policy = await getEffectiveUsagePolicyForUserEmail(args.request, args.userEmail);

  if (!policy) {
    return { allowed: true, policy: null };
  }

  if (policy.locked) {
    return {
      allowed: false,
      policy,
      response: NextResponse.json(
        {
          error: "Your account is locked by the super admin. Access to AI services is disabled.",
          serviceLocked: true,
          policy,
        },
        { status: 423 }
      ),
    };
  }

  const normalizedTool = String(args.toolType || "").trim().toLowerCase();
  const toolAliases = getToolAliases(normalizedTool);
  if (normalizedTool && toolAliases.some((alias) => policy.disabledTools.includes(alias))) {
    return {
      allowed: false,
      policy,
      response: NextResponse.json(
        {
          error: `The \"${normalizedTool}\" tool is disabled for your account.`,
          toolDisabled: true,
          policy,
        },
        { status: 403 }
      ),
    };
  }

  const normalizedModel = String(args.modelId || "").trim().toLowerCase();
  const modelAliases = getModelAliases(normalizedModel);
  if (
    normalizedModel &&
    normalizedModel !== "auto" &&
    modelAliases.some((alias) => policy.disabledModels.includes(alias))
  ) {
    return {
      allowed: false,
      policy,
      response: NextResponse.json(
        {
          error: `The model \"${normalizedModel}\" is disabled for your account.`,
          modelDisabled: true,
          policy,
        },
        { status: 403 }
      ),
    };
  }

  if (normalizedTool && normalizedModel && normalizedModel !== "auto") {
    const enabledModels = getEnabledModelsForTool(policy, normalizedTool);
    if (
      enabledModels &&
      enabledModels.length > 0 &&
      !modelAliases.some((alias) => enabledModels.includes(alias))
    ) {
      return {
        allowed: false,
        policy,
        response: NextResponse.json(
          {
            error: `The model \"${normalizedModel}\" is not enabled for the \"${normalizedTool}\" tool.`,
            modelDisabled: true,
            policy,
          },
          { status: 403 }
        ),
      };
    }
  }

  const effectiveSessionLimit = getSessionResponseLimitForTool(policy, normalizedTool || null);
  if (
    typeof effectiveSessionLimit === "number" &&
    effectiveSessionLimit >= 0 &&
    policy.sessionResponsesUsed >= effectiveSessionLimit
  ) {
    return {
      allowed: false,
      policy,
      response: NextResponse.json(
        {
          error: normalizedTool
            ? `Session response limit reached for "${normalizedTool}" tool. Start a new login session or contact the administrator.`
            : "Session response limit reached. Start a new login session or contact the administrator.",
          sessionResponseLimitReached: true,
          policy,
        },
        { status: 429 }
      ),
    };
  }

  return { allowed: true, policy };
}

export async function incrementSessionResponseUsage(request: Request, userEmail: string): Promise<void> {
  const sessionToken = extractSessionTokenFromRequest(request);
  if (!sessionToken) return;

  const user = await prisma.user.findUnique({
    where: { email: userEmail },
    select: { id: true },
  });
  if (!user) return;

  await prisma.session.updateMany({
    where: {
      sessionToken,
      userId: user.id,
    },
    data: {
      aiResponsesUsed: {
        increment: 1,
      },
    },
  });
}
