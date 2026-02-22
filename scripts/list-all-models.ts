#!/usr/bin/env node

/**
 * Comprehensive Model Lister
 * Lists all available models from OpenAI, Anthropic/Claude, Google/Gemini, and xAI
 * Similar to OpenRouter aggregation
 */

import OpenAI from 'openai';

interface ModelInfo {
  id: string;
  provider: string;
  name: string;
  contextWindow?: number;
  costPerMTok?: number;
  costOutMTok?: number;
  description?: string;
  capabilities?: string[];
}

// Mock API for demonstration - in production, these would call actual APIs
const openaiClient = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const anthropicKey = process.env.ANTHROPIC_API_KEY;
const googleKey = process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY;
const xaiKey = process.env.XAI_API_KEY;

// ============================================================================
// OPENAI MODELS
// ============================================================================
async function listOpenAIModels(): Promise<ModelInfo[]> {
  const models: ModelInfo[] = [];

  try {
    // GPT-4 Models
    models.push(
      {
        id: 'gpt-4-turbo',
        provider: 'OpenAI',
        name: 'GPT-4 Turbo',
        contextWindow: 128000,
        costPerMTok: 10,
        costOutMTok: 30,
        description: 'Most capable GPT-4 variant with 128K context',
        capabilities: ['text', 'vision', 'function-calling', 'json-mode'],
      },
      {
        id: 'gpt-4',
        provider: 'OpenAI',
        name: 'GPT-4 (base)',
        contextWindow: 8192,
        costPerMTok: 30,
        costOutMTok: 60,
        description: 'Original GPT-4 model',
        capabilities: ['text', 'function-calling'],
      },
      {
        id: 'gpt-4-32k',
        provider: 'OpenAI',
        name: 'GPT-4 32K',
        contextWindow: 32768,
        costPerMTok: 60,
        costOutMTok: 120,
        description: 'GPT-4 with 32K context window',
        capabilities: ['text', 'function-calling'],
      },
      {
        id: 'gpt-3.5-turbo',
        provider: 'OpenAI',
        name: 'GPT-3.5 Turbo',
        contextWindow: 4096,
        costPerMTok: 0.5,
        costOutMTok: 1.5,
        description: 'Fast and affordable model',
        capabilities: ['text', 'function-calling'],
      },
      {
        id: 'gpt-3.5-turbo-16k',
        provider: 'OpenAI',
        name: 'GPT-3.5 Turbo 16K',
        contextWindow: 16384,
        costPerMTok: 3,
        costOutMTok: 4,
        description: 'GPT-3.5 with extended context',
        capabilities: ['text', 'function-calling'],
      }
    );
  } catch (error) {
    console.error('Error fetching OpenAI models:', error);
  }

  return models;
}

// ============================================================================
// ANTHROPIC/CLAUDE MODELS
// ============================================================================
function listAnthropicModels(): ModelInfo[] {
  const models: ModelInfo[] = [
    {
      id: 'claude-3-opus-20240229',
      provider: 'Anthropic',
      name: 'Claude 3 Opus',
      contextWindow: 200000,
      costPerMTok: 15,
      costOutMTok: 75,
      description: 'Most capable Claude model with 200K context',
      capabilities: ['text', 'vision', 'long-context'],
    },
    {
      id: 'claude-3-sonnet-20240229',
      provider: 'Anthropic',
      name: 'Claude 3 Sonnet',
      contextWindow: 200000,
      costPerMTok: 3,
      costOutMTok: 15,
      description: 'Balanced performance and speed',
      capabilities: ['text', 'vision', 'long-context'],
    },
    {
      id: 'claude-3-haiku-20240307',
      provider: 'Anthropic',
      name: 'Claude 3 Haiku',
      contextWindow: 200000,
      costPerMTok: 0.8,
      costOutMTok: 4,
      description: 'Fast and compact model',
      capabilities: ['text', 'vision', 'long-context'],
    },
    {
      id: 'claude-2.1',
      provider: 'Anthropic',
      name: 'Claude 2.1',
      contextWindow: 100000,
      costPerMTok: 8,
      costOutMTok: 24,
      description: 'Previous generation Claude with 100K context',
      capabilities: ['text', 'long-context'],
    },
    {
      id: 'claude-instant-1.2',
      provider: 'Anthropic',
      name: 'Claude Instant 1.2',
      contextWindow: 100000,
      costPerMTok: 0.8,
      costOutMTok: 2.4,
      description: 'Fast instant mode',
      capabilities: ['text'],
    },
  ];

  return models;
}

// ============================================================================
// GOOGLE GEMINI MODELS
// ============================================================================
function listGoogleModels(): ModelInfo[] {
  const models: ModelInfo[] = [
    {
      id: 'gemini-1.5-pro',
      provider: 'Google',
      name: 'Gemini 1.5 Pro',
      contextWindow: 1000000,
      costPerMTok: 7,
      costOutMTok: 21,
      description: 'Most capable Gemini with 1M context',
      capabilities: ['text', 'vision', 'audio', 'long-context'],
    },
    {
      id: 'gemini-1.5-flash',
      provider: 'Google',
      name: 'Gemini 1.5 Flash',
      contextWindow: 1000000,
      costPerMTok: 0.075,
      costOutMTok: 0.3,
      description: 'Fast Gemini model with 1M context',
      capabilities: ['text', 'vision', 'audio', 'long-context'],
    },
    {
      id: 'gemini-1.0-pro',
      provider: 'Google',
      name: 'Gemini 1.0 Pro',
      contextWindow: 32768,
      costPerMTok: 0.5,
      costOutMTok: 1.5,
      description: 'Original Gemini Pro',
      capabilities: ['text', 'vision'],
    },
    {
      id: 'gemini-pro-vision',
      provider: 'Google',
      name: 'Gemini Pro Vision',
      contextWindow: 12800,
      costPerMTok: 0.5,
      costOutMTok: 1.5,
      description: 'Vision-optimized Gemini',
      capabilities: ['text', 'vision'],
    },
    {
      id: 'text-embedding-004',
      provider: 'Google',
      name: 'Text Embedding 004',
      contextWindow: 2048,
      costPerMTok: 0.025,
      description: 'Latest embedding model',
      capabilities: ['embeddings'],
    },
  ];

  return models;
}

// ============================================================================
// XAI MODELS
// ============================================================================
function listXAIModels(): ModelInfo[] {
  const models: ModelInfo[] = [
    {
      id: 'grok-1',
      provider: 'xAI',
      name: 'Grok-1',
      contextWindow: 128000,
      costPerMTok: 5,
      costOutMTok: 15,
      description: 'Latest xAI model with real-time knowledge',
      capabilities: ['text', 'real-time', 'reasoning'],
    },
    {
      id: 'grok-1-vision',
      provider: 'xAI',
      name: 'Grok-1 Vision',
      contextWindow: 128000,
      costPerMTok: 7,
      costOutMTok: 21,
      description: 'Grok-1 with vision capabilities',
      capabilities: ['text', 'vision', 'real-time'],
    },
    {
      id: 'grok-1-32k',
      provider: 'xAI',
      name: 'Grok-1 32K',
      contextWindow: 32768,
      costPerMTok: 3,
      costOutMTok: 9,
      description: 'Grok-1 with reduced context',
      capabilities: ['text', 'reasoning'],
    },
  ];

  return models;
}

// ============================================================================
// ADDITIONAL SERVICES (for specialized tasks)
// ============================================================================
function listSpecializedServices(): ModelInfo[] {
  const models: ModelInfo[] = [
    {
      id: 'dall-e-3',
      provider: 'OpenAI',
      name: 'DALL-E 3',
      description: 'Image generation',
      capabilities: ['text-to-image', 'high-quality'],
    },
    {
      id: 'dall-e-2',
      provider: 'OpenAI',
      name: 'DALL-E 2',
      description: 'Image generation (previous version)',
      capabilities: ['text-to-image', 'image-editing'],
    },
    {
      id: 'whisper-1',
      provider: 'OpenAI',
      name: 'Whisper V3',
      description: 'Speech-to-text and audio transcription',
      capabilities: ['speech-to-text', 'multi-language'],
    },
    {
      id: 'stable-diffusion-3',
      provider: 'Stability AI',
      name: 'Stable Diffusion 3',
      description: 'Image generation',
      capabilities: ['text-to-image', 'style-control'],
    },
    {
      id: 'midjourney-v6',
      provider: 'Midjourney',
      name: 'Midjourney v6',
      description: 'High-quality image generation',
      capabilities: ['text-to-image', 'premium-quality'],
    },
    {
      id: 'pika-1.0',
      provider: 'Pika',
      name: 'Pika 1.0',
      description: 'Video generation from text/images',
      capabilities: ['text-to-video', 'image-to-video'],
    },
    {
      id: 'runway-gen3',
      provider: 'Runway',
      name: 'Runway Gen-3',
      description: 'Advanced video generation',
      capabilities: ['text-to-video', 'video-editing'],
    },
    {
      id: 'tesseract-ocr',
      provider: 'Tesseract',
      name: 'Tesseract OCR',
      description: 'Optical character recognition',
      capabilities: ['ocr', 'multi-language'],
    },
    {
      id: 'paddleocr',
      provider: 'PaddleOCR',
      name: 'PaddleOCR',
      description: 'Fast OCR for multiple languages',
      capabilities: ['ocr', 'fast-processing'],
    },
    {
      id: 'docling',
      provider: 'IBM',
      name: 'Docling',
      description: 'Document parsing and understanding',
      capabilities: ['document-parsing', 'pdf-handling'],
    },
  ];

  return models;
}

// ============================================================================
// MAIN AGGREGATION FUNCTION
// ============================================================================
export async function aggregateAllModels(): Promise<Map<string, ModelInfo[]>> {
  const allModels = new Map<string, ModelInfo[]>();

  console.log('🔄 Fetching models from all providers...\n');

  // OpenAI
  console.log('📌 OpenAI Models');
  const openaiModels = await listOpenAIModels();
  allModels.set('openai', openaiModels);
  console.log(`   ✓ Found ${openaiModels.length} models`);

  // Anthropic
  console.log('📌 Anthropic/Claude Models');
  const anthropicModels = listAnthropicModels();
  allModels.set('anthropic', anthropicModels);
  console.log(`   ✓ Found ${anthropicModels.length} models`);

  // Google
  console.log('📌 Google/Gemini Models');
  const googleModels = listGoogleModels();
  allModels.set('google', googleModels);
  console.log(`   ✓ Found ${googleModels.length} models`);

  // xAI
  console.log('📌 xAI/Grok Models');
  const xaiModels = listXAIModels();
  allModels.set('xai', xaiModels);
  console.log(`   ✓ Found ${xaiModels.length} models`);

  // Specialized Services
  console.log('📌 Specialized Services');
  const specializedModels = listSpecializedServices();
  allModels.set('specialized', specializedModels);
  console.log(`   ✓ Found ${specializedModels.length} services`);

  return allModels;
}

// ============================================================================
// EXPORT FOR JSON
// ============================================================================
export async function exportModelsAsJSON(): Promise<string> {
  const allModels = await aggregateAllModels();
  const jsonData = {
    generatedAt: new Date().toISOString(),
    totalModels: Array.from(allModels.values()).reduce((sum, arr) => sum + arr.length, 0),
    providers: Object.fromEntries(
      Array.from(allModels.entries()).map(([provider, models]) => [
        provider,
        {
          count: models.length,
          models: models,
        },
      ])
    ),
  };

  return JSON.stringify(jsonData, null, 2);
}

// ============================================================================
// CLI EXECUTION
// ============================================================================
async function main() {
  try {
    console.log('\n🚀 AI Model Aggregator - OpenRouter Style\n');
    console.log('='.repeat(60) + '\n');

    const allModels = await aggregateAllModels();

    console.log('\n' + '='.repeat(60));
    console.log('\n📊 Summary:\n');

    let totalModels = 0;
    allModels.forEach((models, provider) => {
      totalModels += models.length;
      console.log(`${provider.toUpperCase()}: ${models.length} models/services`);
    });

    console.log(`\n✅ TOTAL: ${totalModels} models/services available\n`);
    console.log(
      '💡 Tip: Use aggregateAllModels() in your application to get all available models.\n'
    );

    // Generate JSON export
    const jsonOutput = await exportModelsAsJSON();
    console.log('📄 JSON Export:\n');
    console.log(jsonOutput);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}
