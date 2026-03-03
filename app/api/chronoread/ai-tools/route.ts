import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { processAIToolRequest, AIToolRequest } from '@/app/services/aiToolsService';
import { authOptions } from '@/app/services/authOptions';
import { enforceUsagePolicy, incrementSessionResponseUsage } from '@/lib/usagePolicy';
import { classifyQuery } from '@/app/services/queryClassifier';
import { routeQuery, resolveRoutingToLegacy } from '@/app/services/modelRouter';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as AIToolRequest;
    const authSession = await getServerSession(authOptions);
    const authEmail = authSession?.user?.email || null;

    const normalizeModel = (value: string): string => {
      const normalized = String(value || '').trim().toLowerCase();
      const aliases: Record<string, string> = {
        'gemini-1.5-flash': 'gemini-1.5-flash',
        'gemini-2.5-flash': 'gemini-2.5-flash',
        'gemini': 'gemini-flash',
        'gemini-flash': 'gemini-flash',
        'gemini-1.5-pro': 'gemini-1.5-pro',
        'gemini-pro': 'gemini-1.5-pro',
        'gpt-4': 'gpt-4-turbo',
        'gpt-3.5': 'gpt-3.5-turbo',
        'claude-3-sonnet': 'claude-sonnet',
        'claude-3-opus': 'claude-opus',
        'claude-3-haiku': 'claude-haiku',
        'grok-1': 'grok-3',
      };
      return aliases[normalized] || normalized;
    };

    const modelAliasSet = (modelId: string): Set<string> => {
      const normalized = normalizeModel(modelId);
      const variants = new Set<string>([normalized]);

      const groups: string[][] = [
        ['gemini-flash', 'gemini-1.5-flash', 'gemini-2.5-flash'],
        ['gemini-1.5-pro', 'gemini-pro'],
        ['gpt-4-turbo', 'gpt-4'],
        ['gpt-3.5-turbo', 'gpt-3.5'],
        ['claude-sonnet', 'claude-3-sonnet'],
        ['claude-opus', 'claude-3-opus'],
        ['claude-haiku', 'claude-3-haiku'],
        ['grok-3', 'grok-1'],
      ];

      for (const group of groups) {
        if (group.includes(normalized)) {
          group.forEach((alias) => variants.add(alias));
        }
      }

      return variants;
    };

    const resolveToEnabledModel = (candidateModel: string, enabledModels: string[]): string | null => {
      if (!candidateModel || enabledModels.length === 0) return null;
      const candidateAliases = modelAliasSet(candidateModel);

      for (const enabled of enabledModels) {
        const enabledAliases = modelAliasSet(enabled);
        if ([...candidateAliases].some((alias) => enabledAliases.has(alias))) {
          return enabled;
        }
      }

      return null;
    };

    const getEnabledModelsForTool = (enabledByTool?: Record<string, string[]> | null): string[] => {
      if (!enabledByTool || typeof enabledByTool !== 'object') return [];

      const toolAliases = [String(body.type || '').toLowerCase()];
      if (body.type === 'document') toolAliases.push('text', 'read');
      if (body.type === 'image' || body.type === 'video') toolAliases.push('text');

      for (const alias of toolAliases) {
        const values = enabledByTool[alias];
        if (Array.isArray(values) && values.length > 0) {
          return values;
        }
      }
      return [];
    };

    const resolveEffectiveModel = (enabledByTool?: Record<string, string[]> | null): string => {
      const requestedModel = typeof body?.options?.model === 'string'
        ? normalizeModel(body.options.model)
        : 'auto';

      const enabledModels = getEnabledModelsForTool(enabledByTool)
        .map((model) => String(model || '').trim().toLowerCase())
        .filter(Boolean);
      const firstAllowed = enabledModels.find(Boolean) || null;

      if (requestedModel !== 'auto' && requestedModel) {
        if (enabledModels.length > 0) {
          return resolveToEnabledModel(requestedModel, enabledModels) || requestedModel;
        }
        return requestedModel;
      }

      if (body.type === 'document') {
        const classification = classifyQuery(body.prompt || '', {
          attachments: (body.attachments || []).map((attachment) => ({
            name: attachment.name,
            type: attachment.type,
            size: Math.round(((attachment.data?.length || 0) * 3) / 4),
          })),
        });

        const decision = routeQuery(classification, {
          aiModel: 'auto',
        });

        const routedModel = normalizeModel(resolveRoutingToLegacy(decision).model || '');
        if (enabledModels.length > 0) {
          const allowedMatch = resolveToEnabledModel(routedModel, enabledModels);
          return allowedMatch || firstAllowed || routedModel || 'auto';
        }

        return routedModel || 'auto';
      }

      return firstAllowed || 'auto';
    };

    // Validate request
    if (!body.type) {
      return NextResponse.json(
        { error: 'Missing tool type' },
        { status: 400 }
      );
    }

    if (authEmail) {
      const policyPreCheck = await enforceUsagePolicy({
        request,
        userEmail: authEmail,
        toolType: body.type,
        modelId: null,
      });

      if (!policyPreCheck.allowed) {
        return policyPreCheck.response;
      }

      const effectiveModel = resolveEffectiveModel(policyPreCheck.policy?.enabledModelsByTool);
      body.options = {
        ...(body.options || {}),
        model: effectiveModel,
      };

      const policyCheck = await enforceUsagePolicy({
        request,
        userEmail: authEmail,
        toolType: body.type,
        modelId: effectiveModel,
      });

      if (!policyCheck.allowed) {
        return policyCheck.response;
      }
    }

    // Process request based on type
    const result = await processAIToolRequest(body);

    if (!result.success) {
      return NextResponse.json(
        { error: result.error },
        { status: 400 }
      );
    }

    if (authEmail) {
      await incrementSessionResponseUsage(request, authEmail).catch(() => undefined);
    }

    return NextResponse.json(result);
  } catch (error: Error | unknown) {
    const err = error instanceof Error ? error : new Error(String(error));
    console.error('AI Tools API error:', err);
    return NextResponse.json(
      { error: 'Failed to process AI tool request', details: err.message },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({
    message: 'AI Tools API',
    availableTools: ['image', 'video', 'ocr', 'document', 'dashboard'],
    endpoints: {
      POST: '/api/chronoread/ai-tools - Process AI tool requests',
    },
  });
}
