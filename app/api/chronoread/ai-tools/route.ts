import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { processAIToolRequest, AIToolRequest } from '@/app/services/aiToolsService';
import { authOptions } from '@/app/services/authOptions';
import { enforceUsagePolicy, incrementSessionResponseUsage } from '@/lib/usagePolicy';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as AIToolRequest;
    const authSession = await getServerSession(authOptions);
    const authEmail = authSession?.user?.email || null;

    // Validate request
    if (!body.type) {
      return NextResponse.json(
        { error: 'Missing tool type' },
        { status: 400 }
      );
    }

    if (authEmail) {
      const modelId = typeof body?.options?.model === 'string' ? body.options.model : null;
      const policyCheck = await enforceUsagePolicy({
        request,
        userEmail: authEmail,
        toolType: body.type,
        modelId,
      });

      if (!policyCheck.allowed) {
        return policyCheck.response;
      }

      const enabledByTool = policyCheck.policy?.enabledModelsByTool;
      const normalizeModel = (value: string): string => {
        const normalized = String(value || '').trim().toLowerCase();
        const aliases: Record<string, string> = {
          'gemini-1.5-flash': 'gemini-flash',
          'gemini-2.5-flash': 'gemini-flash',
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

      const toolAliases = [String(body.type || '').toLowerCase()];
      if (body.type === 'document') toolAliases.push('text', 'read');
      if (body.type === 'image' || body.type === 'video') toolAliases.push('text');

      const enabledModels = (() => {
        if (!enabledByTool || typeof enabledByTool !== 'object') return [] as string[];
        for (const alias of toolAliases) {
          const values = enabledByTool[alias];
          if (Array.isArray(values) && values.length > 0) {
            return values;
          }
        }
        return [] as string[];
      })();

      const requestedModel = typeof body?.options?.model === 'string' ? body.options.model.trim().toLowerCase() : 'auto';
      if (requestedModel === 'auto' && enabledModels.length > 0) {
        const firstAllowed = enabledModels
          .map((model) => normalizeModel(model))
          .find(Boolean);
        if (firstAllowed) {
          body.options = {
            ...(body.options || {}),
            model: firstAllowed,
          };
        }
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
