import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import AIModelRegistry, { ModelProvider, ModelCategory } from '@/app/services/modelRegistry';
import { authOptions } from '@/app/services/authOptions';
import { getEffectiveUsagePolicyForUserEmail } from '@/lib/usagePolicy';

export const runtime = 'nodejs';

const TOOL_CATEGORY_MAP: Record<string, ModelCategory[]> = {
  text: ['text'],
  read: ['text'],
  listen: ['text', 'audio'],
  image: ['image'],
  video: ['video'],
  ocr: ['ocr'],
  document: ['text'],
  dashboard: ['text'],
};

const MODEL_GATED_TOOLS = new Set(['text', 'read', 'listen', 'image', 'video', 'document']);

function normalizeTool(value: string | null): string | null {
  const tool = String(value || '').trim().toLowerCase();
  return tool || null;
}

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const authEmail = session?.user?.email || null;
    const policy = authEmail ? await getEffectiveUsagePolicyForUserEmail(request, authEmail) : null;

    if (policy?.locked) {
      return NextResponse.json(
        { error: 'Your account is locked by the super admin. Model access is disabled.', serviceLocked: true },
        { status: 423 }
      );
    }

    const { searchParams } = new URL(request.url);
    const provider = searchParams.get('provider') as ModelProvider | null;
    const category = searchParams.get('category') as ModelCategory | null;
    const tool = normalizeTool(searchParams.get('tool'));
    const query = searchParams.get('q');

    let models = AIModelRegistry.getAllModels();

    // Filter by provider
    if (provider) {
      models = models.filter((m) => m.provider === provider);
    }

    // Filter by category
    if (category) {
      models = models.filter((m) => m.categories.includes(category));
    }

    if (tool && TOOL_CATEGORY_MAP[tool]) {
      const categories = TOOL_CATEGORY_MAP[tool];
      models = models.filter((model) => model.categories.some((modelCategory) => categories.includes(modelCategory)));
    }

    // Search by name or description
    if (query) {
      const lowerQuery = query.toLowerCase();
      models = models.filter(
        (m) =>
          m.name.toLowerCase().includes(lowerQuery) ||
          m.displayName.toLowerCase().includes(lowerQuery) ||
          m.description.toLowerCase().includes(lowerQuery)
      );
    }

    if (policy?.disabledModels?.length) {
      const disabled = new Set(policy.disabledModels.map((item) => item.toLowerCase()));
      models = models.filter((model) => !disabled.has(model.name.toLowerCase()));
    }

    if (tool && MODEL_GATED_TOOLS.has(tool)) {
      const enabledForTool = policy?.enabledModelsByTool?.[tool] || null;
      if (enabledForTool && enabledForTool.length > 0) {
        const allowSet = new Set(enabledForTool.map((item) => item.toLowerCase()));
        models = models.filter((model) => allowSet.has(model.id.toLowerCase()) || allowSet.has(model.name.toLowerCase()));
      }
    }

    return NextResponse.json({
      count: models.length,
      models,
      summary: AIModelRegistry.getSummary(),
    });
  } catch (error: any) {
    console.error('Models API error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch models', details: error.message },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const authEmail = session?.user?.email || null;
    const policy = authEmail ? await getEffectiveUsagePolicyForUserEmail(request, authEmail) : null;

    if (policy?.locked) {
      return NextResponse.json(
        { error: 'Your account is locked by the super admin. Model access is disabled.', serviceLocked: true },
        { status: 423 }
      );
    }

    const body = await request.json();
    const { action, modelId, criteria } = body;

    if (policy?.disabledModels?.length && typeof modelId === 'string') {
      const disabled = new Set(policy.disabledModels.map((item) => item.toLowerCase()));
      if (disabled.has(modelId.toLowerCase())) {
        return NextResponse.json(
          { error: `The model \"${modelId}\" is disabled for your account.` },
          { status: 403 }
        );
      }
    }

    switch (action) {
      case 'get':
        if (!modelId) {
          return NextResponse.json(
            { error: 'modelId is required' },
            { status: 400 }
          );
        }
        const model = AIModelRegistry.getModel(modelId);
        if (!model) {
          return NextResponse.json(
            { error: 'Model not found' },
            { status: 404 }
          );
        }
        return NextResponse.json(model);

      case 'find-best':
        if (!criteria?.category) {
          return NextResponse.json(
            { error: 'criteria.category is required' },
            { status: 400 }
          );
        }
        const bestModel = AIModelRegistry.findBestModel(criteria);
        if (!bestModel) {
          return NextResponse.json(
            { error: 'No suitable model found' },
            { status: 404 }
          );
        }
        return NextResponse.json(bestModel);

      case 'summary':
        return NextResponse.json(AIModelRegistry.getSummary());

      default:
        return NextResponse.json(
          { error: 'Unknown action' },
          { status: 400 }
        );
    }
  } catch (error: any) {
    console.error('Models API POST error:', error);
    return NextResponse.json(
      { error: 'Failed to process request', details: error.message },
      { status: 500 }
    );
  }
}
