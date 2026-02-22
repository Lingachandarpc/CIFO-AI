/**
 * AI Tools Service
 * Handles image generation, video creation, OCR, document processing, etc.
 */

import { GoogleGenAI } from '@google/genai';

export type AIToolType = 'image' | 'video' | 'ocr' | 'document' | 'dashboard';

export interface ImageConfig {
  size?: '256x256' | '512x512' | '1024x1024' | '1792x1024' | '1024x1792';
  quality?: 'standard' | 'hd';
  style?: 'natural' | 'vivid';
  n?: number; // number of variations
}

export interface VideoConfig {
  duration?: number; // seconds (5, 10, 60)
  resolution?: '480p' | '720p' | '1080p' | '4k';
  aspectRatio?: '16:9' | '9:16' | '1:1';
  fps?: number;
}

export interface AIToolRequest {
  type: AIToolType;
  prompt?: string;
  file?: Buffer | string; // Base64 or file path
  fileName?: string;
  mimeType?: string;
  attachments?: Array<{ type: string; data: string; name: string }>; // Attached files
  imageConfig?: ImageConfig;
  videoConfig?: VideoConfig;
  options?: Record<string, unknown>;
}

export interface AIToolResponse {
  success: boolean;
  data?: unknown;
  error?: string;
  type: AIToolType;
  processingTime: number;
  provider?: string;
}

// ============================================================================
// IMAGE GENERATION SERVICE (DALL-E 3 / Stable Diffusion)
// ============================================================================
export async function generateImage(prompt: string, options?: {
  size?: '256x256' | '512x512' | '1024x1024' | '1792x1024' | '1024x1792';
  quality?: 'standard' | 'hd';
  style?: 'natural' | 'vivid';
  n?: number; // number of variations
  model?: string;
  sourceImageUrl?: string;
}): Promise<AIToolResponse> {
  const startTime = Date.now();

  try {
    const requested = options?.model?.toLowerCase() || 'auto';
    const route = (() => {
      if (requested === 'auto') {
        return { provider: 'gemini' as const, model: 'gemini-2.5-flash-image', fallbackModel: 'imagen-4.0-generate-001' };
      }

      if (requested === 'imagen-4.0-generate-001' || requested === 'gemini-2.5-flash-image') {
        return { provider: 'gemini' as const, model: requested, fallbackModel: 'gemini-2.5-flash-image' };
      }

      if (requested === 'grok-imagine-image' || requested === 'grok-imagine-image-pro') {
        return { provider: 'xai' as const, model: requested, fallbackModel: 'grok-imagine-image' };
      }

      return { provider: 'gemini' as const, model: 'gemini-2.5-flash-image', fallbackModel: 'imagen-4.0-generate-001' };
    })();

    if (route.provider === 'xai') {
        const xaiApiKey = process.env.XAI_API_KEY;
        const xaiImageUrl = process.env.XAI_IMAGE_API_URL || 'https://api.x.ai/v1/images/generations';
      if (!xaiApiKey) {
        return {
          success: false,
          error: 'xAI image provider is not configured. Set XAI_API_KEY.',
          type: 'image',
          processingTime: Date.now() - startTime,
        };
      }

      const xaiModel = route.model === 'grok-imagine-image-pro' || route.model === 'grok-imagine-image'
        ? route.model
        : route.fallbackModel;
        const xaiResponse = await fetch(xaiImageUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${xaiApiKey}`,
          },
          body: JSON.stringify({
            model: xaiModel,
            prompt,
            n: options?.n || 1,
            size: options?.size || '1024x1024',
          }),
        });

      if (!xaiResponse.ok) {
        const xaiError = await xaiResponse.text();
        return {
          success: false,
          error: `xAI image API error: ${xaiError}`,
          type: 'image',
          processingTime: Date.now() - startTime,
          provider: 'xai',
        };
      }

        const xaiData = await xaiResponse.json() as {
          data?: Array<{ url?: string; revised_prompt?: string }>;
        };

        return {
          success: true,
          data: {
            images: (xaiData.data || []).map((img) => ({
              url: img.url,
              revisedPrompt: img.revised_prompt,
            })),
            model: xaiModel,
          },
          type: 'image',
          processingTime: Date.now() - startTime,
          provider: 'xai',
        };
    }

    const geminiApiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
    if (!geminiApiKey) {
      return {
        success: false,
        error: 'Gemini image provider is not configured. Set GEMINI_API_KEY or GOOGLE_API_KEY.',
        type: 'image',
        processingTime: Date.now() - startTime,
      };
    }

    const geminiModel = route.model === 'imagen-4.0-generate-001' || route.model === 'gemini-2.5-flash-image'
      ? route.model
      : route.fallbackModel;
    const geminiImageUrl = process.env.GEMINI_IMAGE_API_URL
      || `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent?key=${geminiApiKey}`;

    const geminiResponse = await fetch(geminiImageUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: `Generate one high-quality image: ${prompt}` }] }],
        generationConfig: {
          responseModalities: ['TEXT', 'IMAGE'],
        },
      }),
    });

    if (!geminiResponse.ok) {
      const geminiError = await geminiResponse.text();
      return {
        success: false,
        error: `Gemini image API error: ${geminiError}`,
        type: 'image',
        processingTime: Date.now() - startTime,
        provider: 'gemini',
      };
    }

    const geminiData = await geminiResponse.json() as {
      candidates?: Array<{
        content?: {
          parts?: Array<{
            text?: string;
            inlineData?: { mimeType?: string; data?: string };
          }>;
        };
      }>;
    };

    const parts = geminiData.candidates?.[0]?.content?.parts || [];
    const imagePart = parts.find((part) => Boolean(part.inlineData?.data));
    const base64Data = imagePart?.inlineData?.data;
    const mimeType = imagePart?.inlineData?.mimeType || 'image/png';

    if (!base64Data) {
      return {
        success: false,
        error: 'Gemini did not return image data for this request.',
        type: 'image',
        processingTime: Date.now() - startTime,
        provider: 'gemini',
      };
    }

    return {
      success: true,
      data: {
        images: [{
          url: `data:${mimeType};base64,${base64Data}`,
        }],
        model: geminiModel,
      },
      type: 'image',
      processingTime: Date.now() - startTime,
      provider: 'gemini',
    };
  } catch (error: any) {
    return {
      success: false,
      error: `Image generation failed: ${error.message}`,
      type: 'image',
      processingTime: Date.now() - startTime,
    };
  }
}

// ============================================================================
// VIDEO GENERATION SERVICE (Pika / Runway)
// ============================================================================
export async function generateVideo(prompt: string, options?: {
  duration?: number; // in seconds
  fps?: number;
  resolution?: '720p' | '1080p' | '4k';
  aspectRatio?: '16:9' | '9:16' | '1:1';
  imageInput?: string; // base64 encoded image
  model?: string;
  provider?: string;
  operationId?: string;
  videoId?: string;
}): Promise<AIToolResponse> {
  const startTime = Date.now();
  const providerErrors: string[] = [];

  try {
    const requestedModel = options?.model?.toLowerCase() || 'auto';

    if (options?.operationId && (options?.provider === 'gemini' || requestedModel.includes('gemini') || requestedModel.includes('veo'))) {
      const geminiApiKey = process.env.GEMINI_VEO_API_KEY || process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
      
      if (!geminiApiKey) {
        return {
          success: false,
          error: 'Gemini: missing GEMINI_API_KEY/GOOGLE_API_KEY',
          type: 'video',
          processingTime: Date.now() - startTime,
        };
      }

      try {
        // Initialize Google GenAI SDK
        const ai = new GoogleGenAI({
          apiKey: geminiApiKey,
        });

        console.log(`[Gemini Video Status Check] Polling operation: ${options.operationId}`);

        // Fetch the operation status using the SDK
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const operation = await ai.operations.get({ 
          operation: { name: options.operationId } as any
        }) as any;

        console.log(`[Gemini Video Status Check] Operation done: ${operation.done}`);

        if (operation.done && operation.response?.generatedVideos?.[0]?.video?.uri) {
          const videoUri = operation.response.generatedVideos[0].video.uri;
          console.log(`[Gemini Video Status Check] Video ready! URI: ${videoUri}`);

          return {
            success: true,
            data: {
              videoUrl: videoUri,
              operationId: options.operationId,
              status: 'completed',
              model: requestedModel,
            },
            type: 'video',
            processingTime: Date.now() - startTime,
            provider: 'gemini',
          };
        } else {
          console.log(`[Gemini Video Status Check] Still processing...`);
          return {
            success: true,
            data: {
              videoUrl: undefined,
              operationId: options.operationId,
              status: operation.done ? 'completed' : 'processing',
              model: requestedModel,
            },
            type: 'video',
            processingTime: Date.now() - startTime,
            provider: 'gemini',
          };
        }
      } catch (error: any) {
        const errorMsg = error?.message || String(error);
        console.error('[Gemini Video Status Check] Error:', errorMsg);
        console.error('[Gemini Video Status Check] Full error:', error);

        return {
          success: false,
          error: `Gemini status check failed: ${errorMsg}`,
          type: 'video',
          processingTime: Date.now() - startTime,
          provider: 'gemini',
        };
      }
    }

    if (options?.videoId && (options?.provider === 'xai' || requestedModel.includes('grok') || requestedModel.includes('xai'))) {
      const xaiApiKey = process.env.XAI_API_KEY;
      if (!xaiApiKey) {
        return {
          success: false,
          error: 'xAI: missing XAI_API_KEY',
          type: 'video',
          processingTime: Date.now() - startTime,
        };
      }

      try {
        const xaiApiUrl = process.env.XAI_VIDEO_API_URL || 'https://api.x.ai/v1/videos';
        const statusUrl = `${xaiApiUrl}/${options.videoId}`;

        console.log(`[xAI Video Status Check] Polling request: ${options.videoId}`);

        const statusResponse = await fetch(statusUrl, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${xaiApiKey}`,
          },
        });

        if (!statusResponse.ok) {
          const errorCode = statusResponse.status;
          const errorText = await statusResponse.text();
          console.error(`[xAI Video Status Check] Status check failed (${errorCode}):`, errorText.substring(0, 200));

          return {
            success: false,
            error: `xAI status check failed (${errorCode})`,
            type: 'video',
            processingTime: Date.now() - startTime,
            provider: 'xai',
          };
        }

        // Per xAI docs: { status: "pending|done|expired", video: { url: "...", duration: 8, respect_moderation: true }, model: "grok-imagine-video" }
        const statusData = await statusResponse.json() as {
          status?: string;
          video?: {
            url?: string;
            duration?: number;
            respect_moderation?: boolean;
          };
          model?: string;
        };

        console.log(`[xAI Video Status Check] Status: ${statusData.status}`);

        if (statusData.status === 'done' && statusData.video?.url) {
          console.log(`[xAI Video Status Check] Video ready! URL: ${statusData.video.url}`);

          return {
            success: true,
            data: {
              videoUrl: statusData.video.url,
              videoId: options.videoId,
              status: 'completed',
              model: statusData.model || 'grok-imagine-video',
              duration: statusData.video.duration,
              moderationPassed: statusData.video.respect_moderation,
            },
            type: 'video',
            processingTime: Date.now() - startTime,
            provider: 'xai',
          };
        } else if (statusData.status === 'expired') {
          console.warn(`[xAI Video Status Check] Request expired`);

          return {
            success: false,
            error: 'xAI: Request expired - video generation failed',
            type: 'video',
            processingTime: Date.now() - startTime,
            provider: 'xai',
          };
        } else {
          console.log(`[xAI Video Status Check] Still processing...`);

          return {
            success: true,
            data: {
              videoUrl: undefined,
              videoId: options.videoId,
              status: 'processing',
              model: statusData.model || 'grok-imagine-video',
            },
            type: 'video',
            processingTime: Date.now() - startTime,
            provider: 'xai',
          };
        }
      } catch (error: any) {
        const errorMsg = error?.message || String(error);
        console.error('[xAI Video Status Check] Error:', errorMsg);

        return {
          success: false,
          error: `xAI status check error: ${errorMsg}`,
          type: 'video',
          processingTime: Date.now() - startTime,
          provider: 'xai',
        };
      }
    }
    // Determine provider order based on requested model
    const preferGemini = requestedModel.includes('gemini') || requestedModel.includes('veo');
    const preferGrok = requestedModel.includes('grok') || requestedModel.includes('xai');
    const preferPika = requestedModel.includes('pika');
    const preferRunway = requestedModel.includes('runway');
    
    // If a specific model is selected (not "auto"), ONLY try that provider - no fallback
    let providerOrder: string[];
    if (requestedModel === 'auto') {
      // Auto mode: try all providers in default order
      providerOrder = ['gemini', 'xai', 'pika', 'runway'];
    } else if (preferGemini) {
      // Specific Gemini model selected: ONLY try Gemini
      providerOrder = ['gemini'];
    } else if (preferGrok) {
      // Specific xAI model selected: ONLY try xAI
      providerOrder = ['xai'];
    } else if (preferPika) {
      providerOrder = ['pika'];
    } else if (preferRunway) {
      providerOrder = ['runway'];
    } else {
      // Unknown model: try Gemini only as default
      providerOrder = ['gemini'];
    }
    
    console.log(`[Video Generation] Requested model: ${requestedModel}, Provider order: ${providerOrder.join(', ')}`);

    const parseVideoUrl = (payload: unknown): string | undefined => {
      const candidate = payload as {
        url?: string;
        videoUrl?: string;
        video_url?: string;
        output_url?: string;
        output?: string[];
        videos?: Array<{ url?: string; videoUrl?: string }>;
        result?: {
          videoUrl?: string;
          video_url?: string;
          video?: { uri?: string; url?: string };
          generatedVideos?: Array<{ video?: { uri?: string; url?: string } }>;
        };
        data?: { url?: string; video_url?: string };
      };
      return candidate.videoUrl
        || candidate.video_url
        || candidate.url
        || candidate.output_url
        || candidate.videos?.[0]?.videoUrl
        || candidate.videos?.[0]?.url
        || candidate.result?.videoUrl
        || candidate.result?.video_url
        || candidate.result?.video?.uri
        || candidate.result?.video?.url
        || candidate.result?.generatedVideos?.[0]?.video?.uri
        || candidate.result?.generatedVideos?.[0]?.video?.url
        || candidate.data?.video_url
        || candidate.data?.url
        || candidate.output?.[0];
    };

    for (const provider of providerOrder) {
      if (provider === 'pika') {
        const pikaApiKey = process.env.PIKA_API_KEY;
        if (!pikaApiKey) {
          providerErrors.push('Pika: missing PIKA_API_KEY');
          continue;
        }

        const response = await fetch('https://api.pika.art/api/v1/create', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${pikaApiKey}`,
          },
          body: JSON.stringify({
            prompt,
            duration: options?.duration || 4,
            quality: options?.resolution || '1080p',
            imageInput: options?.imageInput,
          }),
        });

        if (response.ok) {
          const data = await response.json();
          return {
            success: true,
            data: {
              videoUrl: parseVideoUrl(data),
              videoId: (data as { id?: string }).id,
              status: (data as { status?: string }).status || 'processing',
              estimatedTime: '30-60 seconds',
              model: requestedModel,
            },
            type: 'video',
            processingTime: Date.now() - startTime,
            provider: 'pika',
          };
        }

        const pikaError = await response.text();
        providerErrors.push(`Pika: ${response.status} ${pikaError}`);
      }

      if (provider === 'runway') {
        const runwayApiKey = process.env.RUNWAY_API_KEY;
        if (!runwayApiKey) {
          providerErrors.push('Runway: missing RUNWAY_API_KEY');
          continue;
        }

        const response = await fetch('https://api.runwayml.com/v1/generate', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${runwayApiKey}`,
          },
          body: JSON.stringify({
            prompt,
            model: 'gen3',
            duration: options?.duration || 4,
          }),
        });

        if (response.ok) {
          const data = await response.json();
          return {
            success: true,
            data: {
              videoUrl: parseVideoUrl(data),
              videoId: (data as { id?: string }).id,
              status: (data as { status?: string }).status || 'processing',
              model: requestedModel,
            },
            type: 'video',
            processingTime: Date.now() - startTime,
            provider: 'runway',
          };
        }

        const runwayError = await response.text();
        providerErrors.push(`Runway: ${response.status} ${runwayError}`);
      }

      if (provider === 'gemini') {
        const geminiApiKey = process.env.GEMINI_VEO_API_KEY || process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
        
        if (!geminiApiKey) {
          providerErrors.push('Gemini: missing GEMINI_API_KEY/GOOGLE_API_KEY');
          continue;
        }

        try {
          // Initialize Google GenAI SDK
          const ai = new GoogleGenAI({
            apiKey: geminiApiKey,
          });

          // Try veo-3.1 first (latest model), fall back to veo-2.0
          const geminiModels = [
            'veo-3.1-generate-preview',
            'veo-2.0-generate-001',
          ];

          for (const model of geminiModels) {
            try {
              console.log(`[Gemini Video] Attempting generation with model: ${model}`);
              console.log(`[Gemini Video] Prompt: "${prompt.substring(0, 100)}..."`);

              // Map aspect ratio: normalize 1:1 to 16:9 default
              const aspectRatio = options?.aspectRatio === '9:16' ? '9:16' : '16:9';
              const resolution = (options?.resolution === '1080p' || options?.resolution === '4k') ? options.resolution : '720p';
              const durationSeconds = options?.duration && [4, 6, 8].includes(options.duration) ? String(options.duration) : '8';

              console.log(`[Gemini Video] Config - Aspect: ${aspectRatio}, Resolution: ${resolution}, Duration: ${durationSeconds}s`);

              // Generate video using the SDK with proper configuration
              const generateConfig: { aspect_ratio: string; resolution: string; duration_seconds: string } = {
                aspect_ratio: aspectRatio,
                resolution: resolution,
                duration_seconds: durationSeconds,
              };

              let operation = await ai.models.generateVideos({
                model: model as string,
                prompt: prompt,
                config: generateConfig,
              });

              console.log(`[Gemini Video] Generation request submitted. Operation: ${operation.name || 'unknown'}`);
              console.log(`[Gemini Video] Operation done (initial): ${operation.done}`);

              // Quick initial check (2 seconds max) - don't hold connection too long
              console.log(`[Gemini Video] Initial submission. Operation ID: ${operation.name}`);
              const initialCheckTimeMs = 2000;
              const pollCheckInterval = 500;
              const initialStartTime = Date.now();
              let quickCheckAttempts = 0;

              while (!operation.done && (Date.now() - initialStartTime) < initialCheckTimeMs) {
                quickCheckAttempts++;
                await new Promise((resolve) => setTimeout(resolve, pollCheckInterval));
                operation = await ai.operations.get({ operation });
                console.log(`[Gemini Video] Quick check ${quickCheckAttempts}: done=${operation.done}`);
              }

              // If video is ready, return immediately with URL
              if (operation.done && operation.response?.generatedVideos?.[0]?.video?.uri) {
                const videoUri = operation.response.generatedVideos[0].video.uri;
                console.log(`[Gemini Video] SUCCESS! Video generated during initial check`);
                console.log(`[Gemini Video] Video URI: ${videoUri}`);

                return {
                  success: true,
                  data: {
                    videoUrl: videoUri,
                    operationId: operation.name,
                    status: 'completed',
                    model: model,
                    format: 'mp4',
                    resolution: resolution,
                    aspectRatio: aspectRatio,
                    durationSeconds: durationSeconds,
                  },
                  type: 'video',
                  processingTime: Date.now() - startTime,
                  provider: 'gemini',
                };
              }

              // If still processing, return operationId for client-side polling
              if (!operation.done || (operation.done && !operation.response?.generatedVideos?.[0]?.video?.uri)) {
                console.log(`[Gemini Video] Still processing. Returning operationId for client polls.`);
                console.log(`[Gemini Video] Config: ${aspectRatio}, ${resolution}, ${durationSeconds}s`);

                return {
                  success: true,
                  data: {
                    videoUrl: undefined,
                    operationId: operation.name,
                    status: 'processing',
                    model: model,
                    format: 'mp4',
                    resolution: resolution,
                    aspectRatio: aspectRatio,
                    durationSeconds: durationSeconds,
                    estimatedWaitTime: '30-180 seconds',
                  },
                  type: 'video',
                  processingTime: Date.now() - startTime,
                  provider: 'gemini',
                };
              }
            } catch (modelError: any) {
              const errorMsg = modelError?.message || String(modelError);
              const errorCode = (modelError?.response?.status || modelError?.code || '').toString();
              
              console.error(`[Gemini Video] Error with model ${model} (${errorCode}):`, errorMsg.substring(0, 200));
              console.error(`[Gemini Video] Full error:`, modelError);
              
              // Categorize errors for better user feedback
              if (errorMsg.includes('PERMISSION_DENIED') || errorMsg.includes('permission') || errorMsg.includes('access') || errorCode === '403') {
                providerErrors.push(`Gemini (${model}): Permission denied - Ensure "Generative Language API" and "Video Generation API" are enabled in Google Cloud Console`);
              } else if (errorMsg.includes('RESOURCE_EXHAUSTED') || errorMsg.includes('quota') || errorMsg.includes('exceeded') || errorCode === '429') {
                providerErrors.push(`Gemini (${model}): API quota exceeded or rate limited - wait a few minutes and try again`);
              } else if (errorMsg.includes('not found') || errorMsg.includes('404') || errorCode === '404') {
                providerErrors.push(`Gemini (${model}): Model not available or API endpoint not found`);
              } else if (errorMsg.includes('INVALID_ARGUMENT') || errorMsg.includes('invalid') || errorCode === '400') {
                providerErrors.push(`Gemini (${model}): Invalid request parameters - check aspect_ratio, resolution, duration values`);
              } else if (errorMsg.includes('UNAVAILABLE') || errorMsg.includes('503') || errorCode === '503') {
                providerErrors.push(`Gemini (${model}): Service temporarily unavailable - try again in a moment`);
              } else {
                providerErrors.push(`Gemini (${model}): ${errorMsg.substring(0, 100)}`);
              }
            }
          }
        } catch (error: any) {
          const errorMsg = error?.message || String(error);
          console.error('[Gemini Video] Fatal SDK error:', errorMsg.substring(0, 150));
          console.error('[Gemini Video] Full error:', error);
          
          // SDK-level errors
          if (errorMsg.includes('API key') || errorMsg.includes('invalid') || errorMsg.includes('unauthorized')) {
            providerErrors.push(`Gemini: Invalid or expired API key - check GEMINI_VEO_API_KEY env variable`);
          } else if (errorMsg.includes('not initialized') || errorMsg.includes('constructor')) {
            providerErrors.push(`Gemini: SDK initialization error - check @google/genai package`);
          } else if (errorMsg.includes('fetch') || errorMsg.includes('network')) {
            providerErrors.push(`Gemini: Network error - check internet connection and API endpoint`);
          } else {
            providerErrors.push(`Gemini: ${errorMsg.substring(0, 100)}`);
          }
        }
      }

      if (provider === 'xai') {
        const xaiApiKey = process.env.XAI_API_KEY;
        if (!xaiApiKey) {
          providerErrors.push('xAI: missing XAI_API_KEY');
          continue;
        }

        try {
          const xaiModel = 'grok-imagine-video';
          const xaiApiUrl = process.env.XAI_VIDEO_API_URL || 'https://api.x.ai/v1/videos/generations';

          console.log(`[xAI Video] Attempting generation with model: ${xaiModel}`);
          console.log(`[xAI Video] Prompt: "${prompt.substring(0, 100)}..."`);

          // Validate and normalize parameters per xAI docs
          const providedAspectRatio = options?.aspectRatio || '';
          const aspectRatio = ['1:1', '16:9', '9:16', '4:3', '3:4', '2:3', '3:2'].includes(providedAspectRatio)
            ? providedAspectRatio
            : '16:9';
          
          const resolution = options?.resolution === '720p' ? '720p' : '480p'; // 480p is default
          
          // Duration: 1-15 seconds (default 5)
          const durationSeconds = Math.min(15, Math.max(1, options?.duration || 5));

          console.log(`[xAI Video] Config - Aspect: ${aspectRatio}, Resolution: ${resolution}, Duration: ${durationSeconds}s`);

          // Step 1: Submit generation request (per xAI docs)
          const startResponse = await fetch(xaiApiUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${xaiApiKey}`,
            },
            body: JSON.stringify({
              model: xaiModel,
              prompt: prompt,
              duration: durationSeconds,
              aspect_ratio: aspectRatio,
              resolution: resolution,
            }),
          });

          if (!startResponse.ok) {
            const xaiError = await startResponse.text();
            const errorCode = startResponse.status;
            console.error(`[xAI Video] Start request failed (${errorCode}):`, xaiError.substring(0, 200));

            if (errorCode === 403) {
              providerErrors.push(`xAI: Permission denied - Check XAI_API_KEY and account permissions`);
            } else if (errorCode === 429) {
              providerErrors.push(`xAI: Rate limited - wait a moment and try again`);
            } else if (errorCode === 400) {
              providerErrors.push(`xAI: Invalid parameters - check duration (1-15s), resolution (480p/720p), aspect_ratio`);
            } else {
              providerErrors.push(`xAI: Start request failed (${errorCode})`);
            }
            continue;
          }

          const startData = await startResponse.json() as { request_id?: string };
          const requestId = startData.request_id;

          if (!requestId) {
            console.error(`[xAI Video] No request_id in response:`, JSON.stringify(startData).substring(0, 200));
            providerErrors.push(`xAI: No request_id returned - API response invalid`);
            continue;
          }

          console.log(`[xAI Video] Generation submitted. Request ID: ${requestId}`);

          // Step 2: Quick initial check (2 seconds max)
          const statusUrl = `${xaiApiUrl.replace('/generations', '')}/${requestId}`;
          const initialCheckTimeMs = 2000;
          const pollCheckInterval = 500;
          const initialStartTime = Date.now();
          let quickCheckAttempts = 0;

          while ((Date.now() - initialStartTime) < initialCheckTimeMs) {
            quickCheckAttempts++;
            await new Promise((resolve) => setTimeout(resolve, pollCheckInterval));

            const statusResponse = await fetch(statusUrl, {
              method: 'GET',
              headers: {
                'Authorization': `Bearer ${xaiApiKey}`,
              },
            });

            if (!statusResponse.ok) {
              console.error(`[xAI Video] Status check failed (${statusResponse.status})`);
              break;
            }

            const statusData = await statusResponse.json() as { status?: string; video?: { url?: string; duration?: number; respect_moderation?: boolean } };
            console.log(`[xAI Video] Quick check ${quickCheckAttempts}: status=${statusData.status}`);

            if (statusData.status === 'done' && statusData.video?.url) {
              console.log(`[xAI Video] SUCCESS! Video generated during initial check`);
              console.log(`[xAI Video] Video URL: ${statusData.video.url}`);

              return {
                success: true,
                data: {
                  videoUrl: statusData.video.url,
                  videoId: requestId,
                  status: 'completed',
                  model: xaiModel,
                  format: 'mp4',
                  resolution: resolution,
                  aspectRatio: aspectRatio,
                  durationSeconds: durationSeconds,
                  duration: statusData.video.duration,
                  moderationPassed: statusData.video.respect_moderation,
                },
                type: 'video',
                processingTime: Date.now() - startTime,
                provider: 'xai',
              };
            }

            if (statusData.status === 'expired') {
              console.warn(`[xAI Video] Request expired`);
              providerErrors.push(`xAI: Request expired - try generating again`);
              continue;
            }
          }

          // If still processing, return request_id for client-side polling
          console.log(`[xAI Video] Still processing. Returning request_id for client polls.`);
          console.log(`[xAI Video] Config: ${aspectRatio}, ${resolution}, ${durationSeconds}s`);

          return {
            success: true,
            data: {
              videoUrl: undefined,
              videoId: requestId,
              status: 'processing',
              model: xaiModel,
              format: 'mp4',
              resolution: resolution,
              aspectRatio: aspectRatio,
              durationSeconds: durationSeconds,
              estimatedWaitTime: 'several minutes',
            },
            type: 'video',
            processingTime: Date.now() - startTime,
            provider: 'xai',
          };
        } catch (error: any) {
          const errorMsg = error?.message || String(error);
          console.error('[xAI Video] Fatal error:', errorMsg.substring(0, 150));
          console.error('[xAI Video] Full error:', error);

          if (errorMsg.includes('API key') || errorMsg.includes('unauthorized')) {
            providerErrors.push(`xAI: Invalid or expired API key - check XAI_API_KEY env variable`);
          } else if (errorMsg.includes('network') || errorMsg.includes('fetch')) {
            providerErrors.push(`xAI: Network error - check internet connection`);
          } else {
            providerErrors.push(`xAI: ${errorMsg.substring(0, 100)}`);
          }
        }
      }
    }

    const diagnostics = providerErrors.length > 0
      ? ` Provider diagnostics: ${providerErrors.slice(0, 4).join(' | ')}`
      : '';

    return {
      success: false,
      error: `No video generation service succeeded.${diagnostics}`,
      type: 'video',
      processingTime: Date.now() - startTime,
    };
  } catch (error: any) {
    return {
      success: false,
      error: `Video generation failed: ${error.message}`,
      type: 'video',
      processingTime: Date.now() - startTime,
    };
  }
}

// ============================================================================
// OCR SERVICE (Tesseract / PaddleOCR)
// ============================================================================
export async function performOCR(imageData: Buffer | string, options?: {
  language?: string; // 'eng', 'fra', 'deu', etc.
  fast?: boolean; // use fast mode (PaddleOCR)
}): Promise<AIToolResponse> {
  const startTime = Date.now();

  try {
    // Option 1: Cloud-based OCR (if available)
    const googleCloudKey = process.env.GOOGLE_CLOUD_KEY;

    if (googleCloudKey) {
      const base64Image = typeof imageData === 'string' ? imageData : imageData.toString('base64');

      const response = await fetch('https://vision.googleapis.com/v1/images:annotate?key=' + process.env.GOOGLE_API_KEY, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requests: [
            {
              image: { content: base64Image },
              features: [{ type: 'TEXT_DETECTION' }, { type: 'DOCUMENT_TEXT_DETECTION' }],
            },
          ],
        }),
      });

      if (response.ok) {
        const data = await response.json();
        const textAnnotations = data.responses[0]?.textAnnotations || [];
        const fullText = textAnnotations[0]?.description || '';
        const details = textAnnotations.slice(1).map((annotation: any) => ({
          text: annotation.description,
          confidence: annotation.confidence,
          bounds: annotation.boundingPoly,
        }));

        return {
          success: true,
          data: {
            fullText,
            details,
            language: options?.language || 'eng',
          },
          type: 'ocr',
          processingTime: Date.now() - startTime,
          provider: 'google-vision',
        };
      }
    }

    // Option 2: AWS Textract
    const awsAccessKeyId = process.env.AWS_ACCESS_KEY_ID;
    if (awsAccessKeyId) {
      // Would use @aws-sdk/client-textract
      return {
        success: false,
        error: 'AWS Textract integration requires AWS SDK setup',
        type: 'ocr',
        processingTime: Date.now() - startTime,
      };
    }

    // Fallback response
    return {
      success: true,
      data: {
        fullText: 'OCR processing requires cloud service configuration',
        details: [],
        language: options?.language || 'eng',
      },
      type: 'ocr',
      processingTime: Date.now() - startTime,
      provider: 'fallback',
    };
  } catch (error: any) {
    return {
      success: false,
      error: `OCR processing failed: ${error.message}`,
      type: 'ocr',
      processingTime: Date.now() - startTime,
    };
  }
}

// ============================================================================
// DOCUMENT GENERATION SERVICE (PDF, DOCX, etc.)
// ============================================================================
export async function generateDocument(content: string, format: 'pdf' | 'docx' | 'markdown', options?: {
  title?: string;
  author?: string;
  style?: 'minimal' | 'professional' | 'creative';
}): Promise<AIToolResponse> {
  const startTime = Date.now();

  try {
    // Use libraries like pdfkit, docx, etc.
    const PDFDocument = require('pdfkit');
    const doc = new PDFDocument();
    const chunks: Buffer[] = [];

    doc.on('data', (chunk: Buffer) => chunks.push(chunk));

    if (format === 'pdf') {
      // Build PDF
      if (options?.title) {
        doc.fontSize(24).font('Helvetica-Bold').text(options.title, { align: 'center' });
        doc.moveDown();
      }

      if (options?.author) {
        doc.fontSize(10).font('Helvetica').text(`By ${options.author}`, { align: 'center' });
        doc.moveDown();
      }

      doc.fontSize(12).font('Helvetica').text(content, { align: 'left', width: 500 });
      doc.end();

      return new Promise((resolve) => {
        doc.on('end', () => {
          const pdfBuffer = Buffer.concat(chunks);
          resolve({
            success: true,
            data: {
              buffer: pdfBuffer.toString('base64'),
              format: 'pdf',
              size: pdfBuffer.length,
            },
            type: 'document',
            processingTime: Date.now() - startTime,
            provider: 'pdfkit',
          });
        });
      });
    }

    if (format === 'docx') {
      // DOCX generation using docx library
      return {
        success: true,
        data: {
          content,
          format: 'docx',
          title: options?.title,
        },
        type: 'document',
        processingTime: Date.now() - startTime,
        provider: 'docx-lib',
      };
    }

    if (format === 'markdown') {
      return {
        success: true,
        data: {
          content,
          format: 'markdown',
          title: options?.title,
        },
        type: 'document',
        processingTime: Date.now() - startTime,
        provider: 'native',
      };
    }

    return {
      success: false,
      error: 'Unknown document format',
      type: 'document',
      processingTime: Date.now() - startTime,
    };
  } catch (error: any) {
    return {
      success: false,
      error: `Document generation failed: ${error.message}`,
      type: 'document',
      processingTime: Date.now() - startTime,
    };
  }
}

// ============================================================================
// MAIN ORCHESTRATOR
// ============================================================================
export async function processAIToolRequest(request: AIToolRequest): Promise<AIToolResponse> {
  switch (request.type) {
    case 'image':
      if (!request.prompt) {
        return {
          success: false,
          error: 'Prompt is required for image generation',
          type: 'image',
          processingTime: 0,
        };
      }
      return generateImage(request.prompt, request.options);

    case 'video':
      if (!request.prompt) {
        return {
          success: false,
          error: 'Prompt is required for video generation',
          type: 'video',
          processingTime: 0,
        };
      }
      return generateVideo(request.prompt, request.options);

    case 'ocr':
      if (!request.file) {
        return {
          success: false,
          error: 'File is required for OCR',
          type: 'ocr',
          processingTime: 0,
        };
      }
      const imageBuffer = typeof request.file === 'string' ? Buffer.from(request.file, 'base64') : request.file;
      return performOCR(imageBuffer, request.options);

    case 'document':
      if (!request.prompt) {
        return {
          success: false,
          error: 'Content is required for document generation',
          type: 'document',
          processingTime: 0,
        };
      }
      const format = (request.options?.format || 'pdf') as 'pdf' | 'docx' | 'markdown';
      return generateDocument(request.prompt, format, request.options);

    case 'dashboard':
      // Dashboard would aggregate metrics and provide insights
      return {
        success: true,
        data: {
          message: 'Dashboard endpoint',
          stats: {
            imagesGenerated: 0,
            videosGenerated: 0,
            documentsCreated: 0,
            ocrProcessed: 0,
          },
        },
        type: 'dashboard',
        processingTime: 0,
      };

    default:
      return {
        success: false,
        error: 'Unknown tool type',
        type: 'image',
        processingTime: 0,
      };
  }
}

const aiToolsService = {
  generateImage,
  generateVideo,
  performOCR,
  generateDocument,
  processAIToolRequest,
};

export default aiToolsService;
