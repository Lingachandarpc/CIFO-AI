export const runtime = "nodejs";

import { NextRequest, NextResponse } from "next/server";
import prisma from "../../../../../lib/prisma";
import { isSuperAdminRequest } from "../../../../../lib/superAdminAuth";

const SESSION_LIMITS_BY_TOOL_META_KEY = "__sessionResponseLimitsByTool";

function normalizeStringArray(values: unknown): string[] {
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
    if (tool === "ocr" || tool === "dashboard") continue;
    if (!tool || !Array.isArray(rawModels)) continue;

    normalized[tool] = rawModels
      .map((item) => String(item || "").trim().toLowerCase())
      .filter(Boolean)
      .filter((item, index, list) => list.indexOf(item) === index);
  }

  return normalized;
}

function normalizeSessionResponseLimitsByTool(value: unknown): Record<string, number> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  const normalized: Record<string, number> = {};
  for (const [rawTool, rawLimit] of Object.entries(value as Record<string, unknown>)) {
    const toolKey = String(rawTool || "").trim().toLowerCase();
    const tool = toolKey === "read" ? "text" : toolKey;
    if (!tool) continue;

    const numericLimit = Number(rawLimit);
    if (!Number.isInteger(numericLimit) || numericLimit < 0) continue;

    normalized[tool] = numericLimit;
  }

  return normalized;
}

function readSessionResponseLimitsByTool(value: unknown): Record<string, number> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  const raw = (value as Record<string, unknown>)[SESSION_LIMITS_BY_TOOL_META_KEY];
  return normalizeSessionResponseLimitsByTool(raw);
}

async function getOrCreateGlobalPolicy() {
  const existing = await prisma.globalUsagePolicy.findFirst({ orderBy: { id: "asc" } });
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

export async function GET(request: NextRequest) {
  try {
    if (!isSuperAdminRequest(request)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const policy = await getOrCreateGlobalPolicy();

    return NextResponse.json({
      lockAllUsers: policy.lockAllUsers,
      defaultSessionResponseLimit: policy.defaultSessionResponseLimit,
      disabledTools: policy.disabledTools,
      disabledModels: policy.disabledModels,
      enabledModelsByTool: normalizeEnabledModelsByTool(policy.enabledModelsByTool),
      sessionResponseLimitsByTool: readSessionResponseLimitsByTool(policy.enabledModelsByTool),
    });
  } catch (error) {
    console.error("Admin global policy GET error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    if (!isSuperAdminRequest(request)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const lockAllUsers = Boolean(body?.lockAllUsers);
    const defaultLimitRaw = body?.defaultSessionResponseLimit;
    const defaultSessionResponseLimit =
      defaultLimitRaw === null || defaultLimitRaw === ""
        ? null
        : Number(defaultLimitRaw);

    if (defaultSessionResponseLimit !== null) {
      if (!Number.isInteger(defaultSessionResponseLimit) || defaultSessionResponseLimit < 0) {
        return NextResponse.json(
          { error: "defaultSessionResponseLimit must be a non-negative integer or null" },
          { status: 400 }
        );
      }
    }

    const disabledTools = normalizeStringArray(body?.disabledTools);
    const disabledModels = normalizeStringArray(body?.disabledModels);
    const enabledModelsByTool = normalizeEnabledModelsByTool(body?.enabledModelsByTool);
    const sessionResponseLimitsByTool = normalizeSessionResponseLimitsByTool(body?.sessionResponseLimitsByTool);

    const existing = await getOrCreateGlobalPolicy();

    const updated = await prisma.globalUsagePolicy.update({
      where: { id: existing.id },
      data: {
        lockAllUsers,
        defaultSessionResponseLimit,
        disabledTools,
        disabledModels,
        enabledModelsByTool: {
          ...enabledModelsByTool,
          [SESSION_LIMITS_BY_TOOL_META_KEY]: sessionResponseLimitsByTool,
        },
      },
      select: {
        lockAllUsers: true,
        defaultSessionResponseLimit: true,
        disabledTools: true,
        disabledModels: true,
        enabledModelsByTool: true,
      },
    });

    return NextResponse.json({
      success: true,
      policy: {
        ...updated,
        enabledModelsByTool: normalizeEnabledModelsByTool(updated.enabledModelsByTool),
        sessionResponseLimitsByTool: readSessionResponseLimitsByTool(updated.enabledModelsByTool),
      },
    });
  } catch (error) {
    console.error("Admin global policy POST error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
