import { NextRequest, NextResponse } from 'next/server';
import { processAIToolRequest, AIToolRequest } from '@/app/services/aiToolsService';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as AIToolRequest;

    // Validate request
    if (!body.type) {
      return NextResponse.json(
        { error: 'Missing tool type' },
        { status: 400 }
      );
    }

    // Process request based on type
    const result = await processAIToolRequest(body);

    if (!result.success) {
      return NextResponse.json(
        { error: result.error },
        { status: 400 }
      );
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
