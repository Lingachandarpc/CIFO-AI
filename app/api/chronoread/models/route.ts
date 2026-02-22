import { NextRequest, NextResponse } from 'next/server';
import AIModelRegistry, { ModelProvider, ModelCategory } from '@/app/services/modelRegistry';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const provider = searchParams.get('provider') as ModelProvider | null;
    const category = searchParams.get('category') as ModelCategory | null;
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
    const body = await request.json();
    const { action, modelId, criteria } = body;

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
