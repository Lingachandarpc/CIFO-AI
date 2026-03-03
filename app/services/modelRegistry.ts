/**
 * AI Model Management Service
 * Central hub for managing all available AI models across all providers
 * Similar to OpenRouter but integrated into the application
 */

export type ModelProvider = 'openai' | 'anthropic' | 'google' | 'xai' | 'specialized';
export type ModelCategory = 'text' | 'vision' | 'embeddings' | 'audio' | 'image' | 'video' | 'ocr';

export interface AIModelProfile {
  id: string;
  provider: ModelProvider;
  name: string;
  displayName: string;
  description: string;
  contextWindow: number;
  costPerMTok?: {
    input: number;
    output: number;
  };
  categories: ModelCategory[];
  capabilities: string[];
  maxOutputTokens?: number;
  costEffectiveness: 'budget' | 'balanced' | 'premium'; // cost ranking
  performance: 'low' | 'medium' | 'high' | 'ultra'; // speed/quality ranking
  releaseDate?: string;
  deprecated?: boolean;
  notes?: string;
}

// ============================================================================
// TEXT GENERATION MODELS
// ============================================================================
const TEXT_MODELS: AIModelProfile[] = [
  // OpenAI
  {
    id: 'gpt-4-turbo',
    provider: 'openai',
    name: 'gpt-4-turbo-preview',
    displayName: 'GPT-4 Turbo',
    description: 'Most capable GPT-4 variant with vision and 128K context',
    contextWindow: 128000,
    maxOutputTokens: 4096,
    costPerMTok: { input: 0.01, output: 0.03 },
    categories: ['text', 'vision'],
    capabilities: ['text-generation', 'vision', 'function-calling', 'json-mode', 'reasoning'],
    costEffectiveness: 'premium',
    performance: 'ultra',
    releaseDate: '2024-04-09',
  },
  {
    id: 'gpt-4',
    provider: 'openai',
    name: 'gpt-4-0613',
    displayName: 'GPT-4',
    description: 'Original GPT-4 model',
    contextWindow: 8192,
    maxOutputTokens: 2048,
    costPerMTok: { input: 0.03, output: 0.06 },
    categories: ['text'],
    capabilities: ['text-generation', 'function-calling'],
    costEffectiveness: 'premium',
    performance: 'high',
    releaseDate: '2023-06-13',
  },
  {
    id: 'gpt-3.5-turbo',
    provider: 'openai',
    name: 'gpt-3.5-turbo-0125',
    displayName: 'GPT-3.5 Turbo',
    description: 'Fast and affordable model',
    contextWindow: 4096,
    maxOutputTokens: 2048,
    costPerMTok: { input: 0.0005, output: 0.0015 },
    categories: ['text'],
    capabilities: ['text-generation', 'function-calling'],
    costEffectiveness: 'budget',
    performance: 'high',
    releaseDate: '2024-01-25',
  },

  // Anthropic Claude
  {
    id: 'claude-3-opus',
    provider: 'anthropic',
    name: 'claude-3-opus-20240229',
    displayName: 'Claude 3 Opus',
    description: 'Most capable Claude model with 200K context',
    contextWindow: 200000,
    maxOutputTokens: 4096,
    costPerMTok: { input: 0.015, output: 0.075 },
    categories: ['text', 'vision'],
    capabilities: ['text-generation', 'vision', 'long-context', 'reasoning'],
    costEffectiveness: 'premium',
    performance: 'ultra',
    releaseDate: '2024-02-29',
  },
  {
    id: 'claude-3-sonnet',
    provider: 'anthropic',
    name: 'claude-3-sonnet-20240229',
    displayName: 'Claude 3 Sonnet',
    description: 'Balanced performance and speed',
    contextWindow: 200000,
    maxOutputTokens: 4096,
    costPerMTok: { input: 0.003, output: 0.015 },
    categories: ['text', 'vision'],
    capabilities: ['text-generation', 'vision', 'long-context'],
    costEffectiveness: 'balanced',
    performance: 'high',
    releaseDate: '2024-02-29',
  },
  {
    id: 'claude-3-haiku',
    provider: 'anthropic',
    name: 'claude-3-haiku-20240307',
    displayName: 'Claude 3 Haiku',
    description: 'Fast and compact model',
    contextWindow: 200000,
    maxOutputTokens: 1024,
    costPerMTok: { input: 0.00025, output: 0.00125 },
    categories: ['text', 'vision'],
    capabilities: ['text-generation', 'vision', 'long-context'],
    costEffectiveness: 'budget',
    performance: 'high',
    releaseDate: '2024-03-07',
  },

  // Google Gemini
  {
    id: 'gemini-1.5-pro',
    provider: 'google',
    name: 'gemini-1.5-pro',
    displayName: 'Gemini 1.5 Pro',
    description: 'Most capable Gemini with 1M context',
    contextWindow: 1000000,
    maxOutputTokens: 8192,
    costPerMTok: { input: 0.0035, output: 0.0105 },
    categories: ['text', 'vision', 'audio'],
    capabilities: ['text-generation', 'vision', 'audio', 'long-context', 'function-calling'],
    costEffectiveness: 'premium',
    performance: 'ultra',
    releaseDate: '2024-02-15',
  },
  {
    id: 'gemini-1.5-flash',
    provider: 'google',
    name: 'gemini-1.5-flash',
    displayName: 'Gemini 1.5 Flash',
    description: 'Fast Gemini model with 1M context',
    contextWindow: 1000000,
    maxOutputTokens: 8192,
    costPerMTok: { input: 0.000075, output: 0.0003 },
    categories: ['text', 'vision', 'audio'],
    capabilities: ['text-generation', 'vision', 'audio', 'long-context', 'streaming'],
    costEffectiveness: 'budget',
    performance: 'high',
    releaseDate: '2024-05-14',
  },

  // xAI Grok
  {
    id: 'grok-1',
    provider: 'xai',
    name: 'grok-1',
    displayName: 'Grok-1',
    description: 'Latest xAI model with real-time knowledge',
    contextWindow: 128000,
    maxOutputTokens: 4096,
    costPerMTok: { input: 0.005, output: 0.015 },
    categories: ['text'],
    capabilities: ['text-generation', 'real-time', 'reasoning', 'code-generation'],
    costEffectiveness: 'balanced',
    performance: 'high',
    releaseDate: '2024-03-01',
  },
];

// ============================================================================
// VISION/IMAGE MODELS
// ============================================================================
const VISION_MODELS: AIModelProfile[] = [
  {
    id: 'gemini-2.5-flash-image',
    provider: 'google',
    name: 'gemini-2.5-flash-image',
    displayName: 'Gemini 2.5 Flash Image',
    description: 'Default Gemini image generation model',
    contextWindow: 4096,
    categories: ['image'],
    capabilities: ['text-to-image', 'fast-generation'],
    costEffectiveness: 'balanced',
    performance: 'high',
    releaseDate: '2026-01-01',
  },
  {
    id: 'imagen-4.0-generate-001',
    provider: 'google',
    name: 'imagen-4.0-generate-001',
    displayName: 'Imagen 4.0 Generate',
    description: 'Gemini Imagen image generation model',
    contextWindow: 4096,
    categories: ['image'],
    capabilities: ['text-to-image', 'high-quality'],
    costEffectiveness: 'premium',
    performance: 'ultra',
    releaseDate: '2026-01-01',
  },
  {
    id: 'dall-e-3',
    provider: 'openai',
    name: 'dall-e-3',
    displayName: 'DALL-E 3',
    description: 'Latest image generation model',
    contextWindow: 4096,
    categories: ['image'],
    capabilities: ['text-to-image', 'high-quality', 'style-control'],
    costEffectiveness: 'premium',
    performance: 'ultra',
    releaseDate: '2023-10-12',
  },
  {
    id: 'dall-e-2',
    provider: 'openai',
    name: 'dall-e-2',
    displayName: 'DALL-E 2',
    description: 'Previous generation image model',
    contextWindow: 4096,
    categories: ['image'],
    capabilities: ['text-to-image', 'image-editing', 'image-variation'],
    costEffectiveness: 'balanced',
    performance: 'high',
    releaseDate: '2022-11-17',
  },
  {
    id: 'stable-diffusion-3',
    provider: 'specialized',
    name: 'stable-diffusion-3-large',
    displayName: 'Stable Diffusion 3',
    description: 'Open-source image generation',
    contextWindow: 2048,
    categories: ['image'],
    capabilities: ['text-to-image', 'style-control', 'open-source'],
    costEffectiveness: 'budget',
    performance: 'high',
    releaseDate: '2024-04-25',
  },
  {
    id: 'grok-imagine-image',
    provider: 'xai',
    name: 'grok-imagine-image',
    displayName: 'Grok Imagine Image',
    description: 'xAI text-to-image generation model',
    contextWindow: 4096,
    categories: ['image'],
    capabilities: ['text-to-image', 'style-control'],
    costEffectiveness: 'balanced',
    performance: 'high',
    releaseDate: '2025-01-01',
  },
  {
    id: 'grok-imagine-image-pro',
    provider: 'xai',
    name: 'grok-imagine-image-pro',
    displayName: 'Grok Imagine Image Pro',
    description: 'Higher-quality xAI text-to-image generation model',
    contextWindow: 4096,
    categories: ['image'],
    capabilities: ['text-to-image', 'style-control', 'high-quality'],
    costEffectiveness: 'premium',
    performance: 'ultra',
    releaseDate: '2025-01-01',
  },
];

// ============================================================================
// AUDIO MODELS
// ============================================================================
const AUDIO_MODELS: AIModelProfile[] = [
  {
    id: 'whisper-1',
    provider: 'openai',
    name: 'whisper-1',
    displayName: 'Whisper V3',
    description: 'Speech-to-text and transcription',
    contextWindow: 0,
    categories: ['audio'],
    capabilities: ['speech-to-text', 'multi-language-support', 'streaming'],
    costEffectiveness: 'balanced',
    performance: 'high',
    releaseDate: '2022-12-01',
  },
];

// ============================================================================
// OCR MODELS
// ============================================================================
const OCR_MODELS: AIModelProfile[] = [
  {
    id: 'google-vision-ocr',
    provider: 'google',
    name: 'google-vision-v1',
    displayName: 'Simple response',
    description: 'Basic OCR text extraction',
    contextWindow: 0,
    categories: ['ocr'],
    capabilities: ['text-detection', 'document-detection', 'multi-language'],
    costEffectiveness: 'balanced',
    performance: 'high',
    releaseDate: '2023-01-01',
  },
  {
    id: 'tesseract-ocr',
    provider: 'specialized',
    name: 'tesseract-5',
    displayName: 'Tesseract OCR',
    description: 'Open-source OCR engine',
    contextWindow: 0,
    categories: ['ocr'],
    capabilities: ['text-detection', 'multi-language', 'offline'],
    costEffectiveness: 'budget',
    performance: 'medium',
    releaseDate: '2023-06-15',
  },
];

// ============================================================================
// VIDEO MODELS
// ============================================================================
const VIDEO_MODELS: AIModelProfile[] = [
  {
    id: 'veo-3.1-generate-preview',
    provider: 'google',
    name: 'veo-3.1-generate-preview',
    displayName: 'Veo 3.1 (Gemini)',
    description: '8-second videos with native audio, 720p/1080p/4k, 24fps',
    contextWindow: 0,
    categories: ['video'],
    capabilities: ['text-to-video', 'image-to-video', 'native-audio', 'high-fidelity'],
    costEffectiveness: 'balanced',
    performance: 'ultra',
    releaseDate: '2025-01-15',
  },
  {
    id: 'veo-2.0-generate-001',
    provider: 'google',
    name: 'veo-2.0-generate-001',
    displayName: 'Veo 2.0 (Gemini)',
    description: 'Stable video generation with native audio',
    contextWindow: 0,
    categories: ['video'],
    capabilities: ['text-to-video', 'image-to-video', 'native-audio'],
    costEffectiveness: 'balanced',
    performance: 'high',
    releaseDate: '2024-11-01',
  },
  {
    id: 'grok-imagine-video',
    provider: 'xai',
    name: 'grok-imagine-video',
    displayName: 'Grok Imagine Video (xAI)',
    description: '1-15 second videos, 480p/720p, multiple aspect ratios',
    contextWindow: 0,
    categories: ['video'],
    capabilities: ['text-to-video', 'image-to-video', 'video-editing', 'multiple-aspect-ratios'],
    costEffectiveness: 'balanced',
    performance: 'high',
    releaseDate: '2025-01-01',
  },
  {
    id: 'pika-1.0',
    provider: 'specialized',
    name: 'pika-1-0',
    displayName: 'Pika 1.0',
    description: 'Text-to-video and image-to-video generation',
    contextWindow: 0,
    categories: ['video'],
    capabilities: ['text-to-video', 'image-to-video', 'motion-control'],
    costEffectiveness: 'balanced',
    performance: 'high',
    releaseDate: '2024-03-15',
  },
  {
    id: 'runway-gen3',
    provider: 'specialized',
    name: 'runway-gen-3',
    displayName: 'Runway Gen-3',
    description: 'Advanced video generation and editing',
    contextWindow: 0,
    categories: ['video'],
    capabilities: ['text-to-video', 'video-editing', 'motion-synthesis'],
    costEffectiveness: 'premium',
    performance: 'ultra',
    releaseDate: '2024-02-01',
  },
];

// ============================================================================
// EMBEDDING MODELS
// ============================================================================
const EMBEDDING_MODELS: AIModelProfile[] = [
  {
    id: 'text-embedding-3-large',
    provider: 'openai',
    name: 'text-embedding-3-large',
    displayName: 'Text Embedding 3 Large',
    description: 'Large embedding model with 3072 dimensions',
    contextWindow: 8192,
    categories: ['embeddings'],
    capabilities: ['text-embeddings', 'semantic-search', 'high-accuracy'],
    costEffectiveness: 'balanced',
    performance: 'high',
    releaseDate: '2024-01-25',
  },
  {
    id: 'text-embedding-3-small',
    provider: 'openai',
    name: 'text-embedding-3-small',
    displayName: 'Text Embedding 3 Small',
    description: 'Small embedding model with 1536 dimensions',
    contextWindow: 8192,
    categories: ['embeddings'],
    capabilities: ['text-embeddings', 'semantic-search', 'fast'],
    costEffectiveness: 'budget',
    performance: 'high',
    releaseDate: '2024-01-25',
  },
];

// ============================================================================
// COMPLETE MODEL REGISTRY
// ============================================================================
export class AIModelRegistry {
  private static models: Map<string, AIModelProfile> = new Map();

  static {
    // Initialize registry
    const allModels = [
      ...TEXT_MODELS,
      ...VISION_MODELS,
      ...AUDIO_MODELS,
      ...OCR_MODELS,
      ...VIDEO_MODELS,
      ...EMBEDDING_MODELS,
    ];

    allModels.forEach((model) => {
      this.models.set(model.id, model);
    });
  }

  // Get all models
  static getAllModels(): AIModelProfile[] {
    return Array.from(this.models.values());
  }

  // Get models by provider
  static getModelsByProvider(provider: ModelProvider): AIModelProfile[] {
    return Array.from(this.models.values()).filter((m) => m.provider === provider);
  }

  // Get models by category
  static getModelsByCategory(category: ModelCategory): AIModelProfile[] {
    return Array.from(this.models.values()).filter((m) => m.categories.includes(category));
  }

  // Get single model
  static getModel(id: string): AIModelProfile | undefined {
    return this.models.get(id);
  }

  // Find best model by criteria
  static findBestModel(criteria: {
    category: ModelCategory;
    priority?: 'speed' | 'quality' | 'cost';
  }): AIModelProfile | undefined {
    const candidates = this.getModelsByCategory(criteria.category);

    if (candidates.length === 0) return undefined;

    switch (criteria.priority || 'quality') {
      case 'speed':
        return candidates.sort((a, b) => {
          const perfOrder: Record<string, number> = { low: 0, medium: 1, high: 2, ultra: 3 };
          return perfOrder[b.performance] - perfOrder[a.performance];
        })[0];

      case 'cost':
        return candidates.sort((a, b) => {
          const costOrder: Record<string, number> = { budget: 0, balanced: 1, premium: 2 };
          return costOrder[a.costEffectiveness] - costOrder[b.costEffectiveness];
        })[0];

      case 'quality':
      default:
        return candidates.sort((a, b) => {
          const perfOrder: Record<string, number> = { low: 0, medium: 1, high: 2, ultra: 3 };
          return perfOrder[b.performance] - perfOrder[a.performance];
        })[0];
    }
  }

  // Get models summary
  static getSummary() {
    return {
      totalModels: this.models.size,
      byProvider: {
        openai: this.getModelsByProvider('openai').length,
        anthropic: this.getModelsByProvider('anthropic').length,
        google: this.getModelsByProvider('google').length,
        xai: this.getModelsByProvider('xai').length,
        specialized: this.getModelsByProvider('specialized').length,
      },
      byCategory: {
        text: this.getModelsByCategory('text').length,
        vision: this.getModelsByCategory('vision').length,
        image: this.getModelsByCategory('image').length,
        video: this.getModelsByCategory('video').length,
        audio: this.getModelsByCategory('audio').length,
        ocr: this.getModelsByCategory('ocr').length,
      },
    };
  }
}

export default AIModelRegistry;
