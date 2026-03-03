/**
 * AI Tools Service
 * Handles image generation, video creation, OCR, document processing, etc.
 */

import { GoogleGenAI } from '@google/genai';
import { JWT, OAuth2Client } from 'google-auth-library';
import { Document, Packer, Paragraph, Table, TableCell, TableRow, TextRun, WidthType } from 'docx';
import * as XLSX from 'xlsx';
import { existsSync, readFileSync } from 'fs';

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
      // Auto mode: default to Gemini only (best quality + availability)
      providerOrder = ['gemini'];
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

          const geminiModels = requestedModel === 'veo-3.1-generate-preview'
            ? ['veo-3.1-generate-preview']
            : requestedModel === 'veo-2.0-generate-001'
              ? ['veo-2.0-generate-001']
              : [
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
// OCR SERVICE (Google Cloud Vision API)
// ============================================================================
export async function performOCR(imageData: Buffer | string, options?: {
  language?: string; // supports ISO-639/BCP-47 hints
  fast?: boolean;
  mimeType?: string;
  fileName?: string;
}): Promise<AIToolResponse> {
  const startTime = Date.now();

  try {
    type GoogleServiceAccount = {
      client_email?: string;
      private_key?: string;
    };

    const GOOGLE_SCOPE = 'https://www.googleapis.com/auth/cloud-platform';

    const parseServiceAccountFromRaw = (raw: string): GoogleServiceAccount | null => {
      const normalizedRaw = raw.trim();
      if (!normalizedRaw) return null;

      const parseJsonText = (jsonText: string): GoogleServiceAccount | null => {
        try {
          const parsed = JSON.parse(jsonText) as GoogleServiceAccount;
          if (parsed?.private_key) {
            parsed.private_key = parsed.private_key.replace(/\\n/g, '\n');
          }
          return parsed;
        } catch {
          return null;
        }
      };

      if (normalizedRaw.startsWith('{') && normalizedRaw.endsWith('}')) {
        return parseJsonText(normalizedRaw);
      }

      try {
        const decoded = Buffer.from(normalizedRaw, 'base64').toString('utf8').trim();
        if (decoded.startsWith('{') && decoded.endsWith('}')) {
          return parseJsonText(decoded);
        }
      } catch {
      }

      if (normalizedRaw.endsWith('.json') && existsSync(normalizedRaw)) {
        try {
          const content = readFileSync(normalizedRaw, 'utf8');
          return parseJsonText(content);
        } catch {
          return null;
        }
      }

      return null;
    };

    const getServiceAccountFromVisionEnv = (): GoogleServiceAccount | null => {
      const credentialCandidates = [
        process.env.GOOGLE_TTS_SERVICE_ACCOUNT_JSON,
        process.env.GOOGLE_VISION_SERVICE_ACCOUNT_JSON,
        process.env.GOOGLE_SERVICE_ACCOUNT_JSON,
        process.env.GOOGLE_APPLICATION_CREDENTIALS,
      ].filter((value): value is string => Boolean(value && value.trim()));

      for (const configured of credentialCandidates) {
        const parsed = parseServiceAccountFromRaw(configured);
        if (parsed?.client_email && parsed.private_key) {
          return parsed;
        }
      }

      return null;
    };

    const getVisionAccessToken = async (): Promise<string | null> => {
      const serviceAccount = getServiceAccountFromVisionEnv();
      if (serviceAccount?.client_email && serviceAccount.private_key) {
        try {
          const client = new JWT({
            email: serviceAccount.client_email,
            key: serviceAccount.private_key,
            scopes: [GOOGLE_SCOPE],
          });

          const token = await client.getAccessToken();
          return typeof token === 'string' ? token : token?.token || null;
        } catch {
        }
      }

      const googleClientId = process.env.GOOGLE_CLIENT_ID;
      const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET;
      const googleRefreshToken = process.env.GOOGLE_REFRESH_TOKEN || process.env.GOOGLE_OAUTH_REFRESH_TOKEN;
      if (!googleClientId || !googleClientSecret || !googleRefreshToken) {
        return null;
      }

      try {
        const oauthClient = new OAuth2Client(googleClientId, googleClientSecret);
        oauthClient.setCredentials({ refresh_token: googleRefreshToken });
        const tokenResult = await oauthClient.getAccessToken();
        return typeof tokenResult === 'string' ? tokenResult : tokenResult?.token || null;
      } catch {
        return null;
      }
    };

    const accessToken = await getVisionAccessToken();
    if (!accessToken) {
      return {
        success: false,
        error: 'Google Vision credentials are missing. Set GOOGLE_VISION_SERVICE_ACCOUNT_JSON (or GOOGLE_SERVICE_ACCOUNT_JSON / GOOGLE_TTS_SERVICE_ACCOUNT_JSON / GOOGLE_APPLICATION_CREDENTIALS) or OAuth env vars (GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN).',
        type: 'ocr',
        processingTime: Date.now() - startTime,
        provider: 'google-vision',
      };
    }

    const base64Image = (typeof imageData === 'string' ? imageData : imageData.toString('base64'))
      .replace(/^data:[^;]+;base64,/i, '')
      .trim();

    const languageMap: Record<string, string> = {
      eng: 'en',
      fra: 'fr',
      fre: 'fr',
      deu: 'de',
      ger: 'de',
      spa: 'es',
      por: 'pt',
      hin: 'hi',
      tam: 'ta',
      tel: 'te',
      mal: 'ml',
      kan: 'kn',
      ben: 'bn',
      mar: 'mr',
      guj: 'gu',
      pan: 'pa',
      jpn: 'ja',
      zho: 'zh',
      chi: 'zh',
    };
    const normalizedLanguage = options?.language
      ? (languageMap[options.language.toLowerCase()] || options.language)
      : undefined;

    const mimeType = String(options?.mimeType || '').toLowerCase();
    const shouldUseFilesAnnotate =
      mimeType.includes('pdf') ||
      mimeType.includes('tiff') ||
      mimeType.includes('gif');

    const featureType = options?.fast ? 'TEXT_DETECTION' : 'DOCUMENT_TEXT_DETECTION';

    const endpoint = shouldUseFilesAnnotate
      ? 'https://vision.googleapis.com/v1/files:annotate'
      : 'https://vision.googleapis.com/v1/images:annotate';

    const requestBody = shouldUseFilesAnnotate
      ? {
          requests: [
            {
              inputConfig: {
                content: base64Image,
                mimeType: mimeType || 'application/pdf',
              },
              features: [{ type: featureType }],
              ...(normalizedLanguage
                ? {
                    imageContext: {
                      languageHints: [normalizedLanguage],
                    },
                  }
                : {}),
            },
          ],
        }
      : {
          requests: [
            {
              image: { content: base64Image },
              features: [{ type: featureType }],
              ...(normalizedLanguage
                ? {
                    imageContext: {
                      languageHints: [normalizedLanguage],
                    },
                  }
                : {}),
            },
          ],
        };

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorBody = await response.text().catch(() => '');
      return {
        success: false,
        error: `Google Vision OCR failed (${response.status}). ${errorBody || 'No response body.'}`,
        type: 'ocr',
        processingTime: Date.now() - startTime,
        provider: 'google-vision',
      };
    }

    const data = await response.json();
    const firstResponse = shouldUseFilesAnnotate
      ? data?.responses?.[0]?.responses?.[0] || {}
      : data?.responses?.[0] || {};
    const responseError = firstResponse?.error;
    if (responseError?.message) {
      return {
        success: false,
        error: `Google Vision OCR error: ${responseError.message}`,
        type: 'ocr',
        processingTime: Date.now() - startTime,
        provider: 'google-vision',
      };
    }

    const fullText = firstResponse?.fullTextAnnotation?.text || firstResponse?.textAnnotations?.[0]?.description || '';
    const pages = firstResponse?.fullTextAnnotation?.pages || [];
    const details = pages.map((page: any, pageIndex: number) => ({
      page: pageIndex + 1,
      confidence: page?.confidence,
    }));

    return {
      success: true,
      data: {
        fullText,
        details,
        language: normalizedLanguage || options?.language || 'en',
      },
      type: 'ocr',
      processingTime: Date.now() - startTime,
      provider: 'google-vision',
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
export async function generateDocument(content: string, format: 'pdf' | 'docx' | 'xlsx' | 'markdown', options?: {
  title?: string;
  author?: string;
  style?: 'minimal' | 'professional' | 'creative';
  targetFileSizeKB?: number;
  fileName?: string;
}): Promise<AIToolResponse> {
  const startTime = Date.now();

  try {
    const normalized = String(content || '').replace(/\r\n/g, '\n').trim();

    const looksLikeProviderError =
      /\bsorry\b/i.test(normalized) &&
      /(unavailable|encountered an error|failed|try again)/i.test(normalized) &&
      normalized.length < 280;

    if (!normalized || looksLikeProviderError) {
      return {
        success: false,
        error: 'Document content is unavailable. Please retry after AI response generation succeeds.',
        type: 'document',
        processingTime: Date.now() - startTime,
      };
    }

    const normalizeReportTitle = (value?: string) => {
      const cleaned = String(value || '')
        .replace(/[\r\n]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      if (!cleaned) return 'Research Report';
      return cleaned.slice(0, 120);
    };

    const reportTitle = normalizeReportTitle(options?.title || 'Research Report');
    const fileName = options?.fileName || `${reportTitle.toLowerCase().replace(/[^a-z0-9]+/gi, '-')}.${format === 'markdown' ? 'md' : format}`;

    const lines = normalized.split('\n').map((line) => line.trim());
    const nonEmptyLines = lines.filter(Boolean);

    const extractSimpleTable = (): { columns: string[]; rows: string[][] } | null => {
      const match = normalized.match(/```table\s*([\s\S]*?)```/i);
      if (!match?.[1]) return null;
      try {
        const parsed = JSON.parse(match[1]);
        const columns = Array.isArray(parsed?.columns) ? parsed.columns.map((col: unknown) => String(col)) : [];
        const rows = Array.isArray(parsed?.rows)
          ? parsed.rows.map((row: unknown) => Array.isArray(row) ? row.map((cell: unknown) => String(cell)) : [])
          : [];
        if (!columns.length || !rows.length) return null;
        return { columns, rows };
      } catch {
        return null;
      }
    };

    const extractMarkdownPipeTableFromLines = (sourceLines: string[]) => {
      for (let i = 0; i < sourceLines.length - 1; i += 1) {
        const headerLine = sourceLines[i];
        const separatorLine = sourceLines[i + 1];
        if (!headerLine?.includes('|')) continue;
        if (!/^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)+\|?\s*$/.test(separatorLine || '')) continue;

        const parseRow = (row: string) => row
          .replace(/^\s*\|/, '')
          .replace(/\|\s*$/, '')
          .split('|')
          .map((cell) => cell.trim());

        const columns = parseRow(headerLine);
        const rows: string[][] = [];
        const consumed = new Set<number>([i, i + 1]);

        let j = i + 2;
        while (j < sourceLines.length && sourceLines[j]?.includes('|')) {
          rows.push(parseRow(sourceLines[j]));
          consumed.add(j);
          j += 1;
        }

        if (columns.length && rows.length) {
          return { columns, rows, consumed };
        }
      }

      return null;
    };

    const tableData = extractSimpleTable();

    const normalizePdfText = (value: string): string => value
      .replace(/[•◦▪▫‣]/g, '-')
      .replace(/[“”]/g, '"')
      .replace(/[‘’]/g, "'")
      .replace(/[–—]/g, '-')
      .replace(/[\u{1F300}-\u{1FAFF}]/gu, '')
      .replace(/[^\x20-\x7E\n]/g, '')
      .replace(/\s{2,}/g, ' ')
      .trim();

    const sanitizePdfText = (value: string): string => normalizePdfText(value)
      .replace(/\\/g, '\\\\')
      .replace(/\(/g, '\\(')
      .replace(/\)/g, '\\)');

    const wrapText = (value: string, maxChars = 92): string[] => {
      const text = value.trim();
      if (!text) return [''];
      const words = text.split(/\s+/).filter(Boolean);
      const wrapped: string[] = [];
      let current = '';

      for (const word of words) {
        const next = current ? `${current} ${word}` : word;
        if (next.length <= maxChars) {
          current = next;
          continue;
        }
        if (current) {
          wrapped.push(current);
          current = word;
        } else {
          wrapped.push(word.slice(0, maxChars));
          current = word.slice(maxChars);
        }
      }

      if (current) wrapped.push(current);
      return wrapped.length ? wrapped : [''];
    };

    const buildSimplePdf = (title: string, contentLines: string[], author?: string): Buffer => {
      type PdfTextSegment = { text: string; font: 'F1' | 'F2' };
      type PdfLine = { segments: PdfTextSegment[]; size: number; gap: number; x: number };

      const pageWidth = 595.28;
      const pageHeight = 841.89;
      const margin = 48;
      const bottomLimit = 60;
      const contentWidth = pageWidth - margin * 2;

      const parseBoldSegments = (input: string, defaultFont: 'F1' | 'F2' = 'F1'): PdfTextSegment[] => {
        const segments: PdfTextSegment[] = [];
        const text = input || '';

        if (defaultFont === 'F2') {
          const cleaned = text.replace(/\*\*/g, '');
          if (cleaned) segments.push({ text: cleaned, font: 'F2' });
          return segments;
        }

        const regex = /\*\*(.+?)\*\*/g;
        let last = 0;
        let match: RegExpExecArray | null = null;
        while ((match = regex.exec(text)) !== null) {
          const prefix = text.slice(last, match.index);
          if (prefix) segments.push({ text: prefix, font: defaultFont });
          if (match[1]) segments.push({ text: match[1], font: 'F2' });
          last = regex.lastIndex;
        }
        const tail = text.slice(last);
        if (tail) segments.push({ text: tail, font: defaultFont });

        if (!segments.length) {
          const cleaned = text.replace(/\*\*/g, '');
          if (cleaned) segments.push({ text: cleaned, font: defaultFont });
        }

        return segments;
      };

      const visibleLength = (text: string) => text.replace(/\*\*/g, '').length;

      const splitSegmentsByWidth = (segments: PdfTextSegment[], maxChars: number): PdfTextSegment[][] => {
        if (!segments.length) return [[{ text: '', font: 'F1' }]];

        const words: PdfTextSegment[] = [];
        segments.forEach((segment) => {
          const parts = segment.text.split(/(\s+)/).filter((part) => part.length > 0);
          parts.forEach((part) => words.push({ text: part, font: segment.font }));
        });

        const rows: PdfTextSegment[][] = [];
        let currentRow: PdfTextSegment[] = [];
        let currentLen = 0;

        const pushRow = () => {
          if (currentRow.length) rows.push(currentRow);
          currentRow = [];
          currentLen = 0;
        };

        for (const word of words) {
          const tokenLen = visibleLength(word.text);
          if (tokenLen > maxChars && tokenLen > 0) {
            if (currentRow.length) pushRow();
            let remaining = word.text;
            while (remaining.length > maxChars) {
              rows.push([{ text: remaining.slice(0, maxChars), font: word.font }]);
              remaining = remaining.slice(maxChars);
            }
            if (remaining) {
              currentRow.push({ text: remaining, font: word.font });
              currentLen = visibleLength(remaining);
            }
            continue;
          }

          if (currentLen + tokenLen > maxChars && currentRow.length) {
            pushRow();
          }

          currentRow.push(word);
          currentLen += tokenLen;
        }

        if (currentRow.length) pushRow();
        return rows.length ? rows : [[{ text: '', font: 'F1' }]];
      };

      const markdownTable = extractMarkdownPipeTableFromLines(contentLines);
      const resolvedTable = tableData || (markdownTable ? { columns: markdownTable.columns, rows: markdownTable.rows } : null);
      const skipIndexes = markdownTable?.consumed || new Set<number>();

      const pdfLines: PdfLine[] = [];
      const titleSegments = parseBoldSegments(title, 'F2');
      const wrappedTitleSegments = splitSegmentsByWidth(titleSegments, 56);
      wrappedTitleSegments.forEach((segmentRow, index) => {
        const mergedText = segmentRow.map((segment) => segment.text).join('');
        pdfLines.push({
          segments: [{ text: mergedText, font: 'F2' }],
          size: 22,
          gap: index === wrappedTitleSegments.length - 1 ? 30 : 24,
          x: margin,
        });
      });
      pdfLines.push({ segments: [{ text: `Generated: ${new Date().toLocaleString()}`, font: 'F1' }], size: 10, gap: 14, x: margin });
      if (author) {
        pdfLines.push({ segments: [{ text: `Author: ${author}`, font: 'F1' }], size: 10, gap: 14, x: margin });
      }
      pdfLines.push({ segments: [], size: 10, gap: 16, x: margin });

      for (let index = 0; index < contentLines.length; index += 1) {
        if (skipIndexes.has(index)) continue;

        const line = contentLines[index];
        const cleaned = line.trim();
        if (!cleaned) {
          pdfLines.push({ segments: [], size: 11, gap: 14, x: margin });
          continue;
        }

        const isHeading = /^#{1,6}\s+/.test(cleaned) || /^(executive summary|introduction|method|analysis|findings|recommendations|conclusion|appendix)/i.test(cleaned);
        const isBullet = /^[-*]\s+/.test(cleaned);
        const isOrdered = /^\d+[.)]\s+/.test(cleaned);
        const baseText = cleaned
          .replace(/^#{1,6}\s+/, '')
          .replace(/^[-*]\s+/, '- ');
        const size = isHeading ? 13 : 11;
        const gap = isHeading ? 20 : 15;
        const indent = isHeading ? 0 : isBullet ? 18 : isOrdered ? 14 : 8;
        const maxChars = isHeading ? 80 : Math.max(52, Math.floor((contentWidth - indent * 2) / 5.5));
        const segments = parseBoldSegments(baseText, isHeading ? 'F2' : 'F1');
        const wrappedSegments = splitSegmentsByWidth(segments, maxChars);

        wrappedSegments.forEach((segmentRow, rowIndex) => {
          const mergedText = segmentRow.map((segment) => segment.text).join('');
          const mergedFont: 'F1' | 'F2' = segmentRow.some((segment) => segment.font === 'F2') ? 'F2' : (isHeading ? 'F2' : 'F1');
          pdfLines.push({
            segments: [{ text: mergedText, font: mergedFont }],
            size,
            gap: rowIndex === wrappedSegments.length - 1 ? gap : 14,
            x: margin + indent,
          });
        });
      }

      const pages: string[] = [];
      let y = pageHeight - margin;
      let commands: string[] = [];

      const approxCharWidth = (text: string, size: number, font: 'F1' | 'F2') => {
        const factor = font === 'F2' ? 0.64 : 0.6;
        return visibleLength(text) * size * factor;
      };

      const flushPage = () => {
        pages.push(commands.join('\n'));
        commands = [];
        y = pageHeight - margin;
      };

      const ensureVerticalSpace = (required: number) => {
        if (y - required <= bottomLimit) {
          flushPage();
        }
      };

      const drawLine = (x1: number, y1: number, x2: number, y2: number) => {
        commands.push(`${x1.toFixed(2)} ${y1.toFixed(2)} m ${x2.toFixed(2)} ${y2.toFixed(2)} l S`);
      };

      const drawChart = (table: { columns: string[]; rows: string[][] }) => {
        const parseNumeric = (value: string): number | null => {
          const cleaned = String(value || '').replace(/,/g, '').replace(/%/g, '').trim();
          if (!cleaned) return null;
          const parsed = Number(cleaned);
          return Number.isFinite(parsed) ? parsed : null;
        };

        const maxColsToScan = Math.min(8, table.columns.length);
        let numericColIndex = -1;
        for (let col = 0; col < maxColsToScan; col += 1) {
          const numericCount = table.rows.reduce((count, row) => count + (parseNumeric(row[col] || '') !== null ? 1 : 0), 0);
          if (numericCount >= Math.max(2, Math.floor(table.rows.length * 0.4))) {
            numericColIndex = col;
            break;
          }
        }

        if (numericColIndex === -1) return;

        const labelColIndex = numericColIndex === 0 && table.columns.length > 1 ? 1 : 0;
        const dataPoints = table.rows
          .map((row, index) => ({
            label: sanitizePdfText((row[labelColIndex] || `Item ${index + 1}`).slice(0, 14)) || `Item ${index + 1}`,
            value: parseNumeric(row[numericColIndex] || ''),
          }))
          .filter((point) => point.value !== null) as Array<{ label: string; value: number }>;

        const visiblePoints = dataPoints.slice(0, 8);
        if (!visiblePoints.length) return;

        const maxValue = Math.max(...visiblePoints.map((point) => point.value), 1);
        const chartHeight = 156;
        const axisLeft = margin + 24;
        const axisBottom = y - 28;
        const plotWidth = contentWidth - 36;
        const plotHeight = chartHeight - 42;
        const gap = 8;
        const barWidth = Math.max(14, (plotWidth - gap * (visiblePoints.length + 1)) / visiblePoints.length);

        ensureVerticalSpace(chartHeight + 52);
        commands.push(`BT /F2 11 Tf 1 0 0 1 ${margin.toFixed(2)} ${(y - 6).toFixed(2)} Tm (Chart: ${sanitizePdfText(table.columns[numericColIndex] || 'Metric')}) Tj ET`);
        y -= 20;

        drawLine(axisLeft, axisBottom, axisLeft, axisBottom + plotHeight);
        drawLine(axisLeft, axisBottom, axisLeft + plotWidth, axisBottom);

        visiblePoints.forEach((point, index) => {
          const barHeight = Math.max(1, (point.value / maxValue) * (plotHeight - 10));
          const x = axisLeft + gap + index * (barWidth + gap);
          const yBase = axisBottom;

          commands.push('0.28 0.56 0.86 rg');
          commands.push(`${x.toFixed(2)} ${yBase.toFixed(2)} ${barWidth.toFixed(2)} ${barHeight.toFixed(2)} re f`);
          commands.push('0 0 0 rg');
          commands.push(`${x.toFixed(2)} ${yBase.toFixed(2)} ${barWidth.toFixed(2)} ${barHeight.toFixed(2)} re S`);

          const valueText = sanitizePdfText(String(Math.round(point.value * 100) / 100));
          commands.push(`BT /F1 8 Tf 1 0 0 1 ${(x + 1).toFixed(2)} ${(yBase + barHeight + 4).toFixed(2)} Tm (${valueText}) Tj ET`);
          commands.push(`BT /F1 8 Tf 1 0 0 1 ${(x + 1).toFixed(2)} ${(yBase - 10).toFixed(2)} Tm (${point.label}) Tj ET`);
        });

        y = axisBottom - 18;
      };

      const drawTable = (table: { columns: string[]; rows: string[][] }) => {
        const headers = table.columns.map((col) => col || '');
        const rows = table.rows.slice(0, 25);
        if (!headers.length || !rows.length) return;

        const maxCols = Math.max(1, Math.min(headers.length, 6));
        const visibleHeaders = headers.slice(0, maxCols);
        const visibleRows = rows.map((row) => row.slice(0, maxCols));
        const lineHeight = 11;
        const cellPaddingX = 4;
        const cellPaddingTop = 4;
        const cellPaddingBottom = 4;
        const colWidth = contentWidth / maxCols;

        const drawTableRow = (cells: string[], isHeader: boolean) => {
          const maxCharsPerCell = Math.max(8, Math.floor((colWidth - cellPaddingX * 2) / 5.2));
          const wrappedCells = Array.from({ length: maxCols }, (_, col) => {
            const rawText = normalizePdfText(cells[col] || '');
            const wrapped = wrapText(rawText, maxCharsPerCell);
            return wrapped.length ? wrapped : [''];
          });

          const rowLineCount = wrappedCells.reduce((acc, lines) => Math.max(acc, lines.length), 1);
          const rowHeight = cellPaddingTop + rowLineCount * lineHeight + cellPaddingBottom;

          ensureVerticalSpace(rowHeight + 8);
          const top = y;
          const bottom = y - rowHeight;

          for (let col = 0; col < maxCols; col += 1) {
            const x = margin + col * colWidth;
            commands.push(`${x.toFixed(2)} ${bottom.toFixed(2)} ${colWidth.toFixed(2)} ${rowHeight.toFixed(2)} re S`);
            const font = isHeader ? 'F2' : 'F1';
            wrappedCells[col].forEach((lineText, rowLineIndex) => {
              const cellText = sanitizePdfText(lineText);
              commands.push(`BT /${font} 9 Tf 1 0 0 1 ${(x + cellPaddingX).toFixed(2)} ${(top - cellPaddingTop - 9 - rowLineIndex * lineHeight).toFixed(2)} Tm (${cellText}) Tj ET`);
            });
          }

          y = bottom;
        };

        pdfLines.push({ segments: [], size: 11, gap: 12, x: margin });
        drawTableRow(visibleHeaders, true);
        visibleRows.forEach((row) => drawTableRow(row, false));
      };

      for (const entry of pdfLines) {
        ensureVerticalSpace(entry.gap + 4);
        if (entry.segments.length) {
          let x = entry.x;
          for (const segment of entry.segments) {
            const text = sanitizePdfText(segment.text || '');
            if (!text) continue;
            commands.push(`BT /${segment.font} ${entry.size} Tf 1 0 0 1 ${x.toFixed(2)} ${y.toFixed(2)} Tm (${text}) Tj ET`);
            x += approxCharWidth(segment.text, entry.size, segment.font);
          }
        }
        y -= entry.gap;
      }

      if (resolvedTable) {
        drawTable(resolvedTable);
        drawChart(resolvedTable);
      }

      if (!commands.length) {
        commands.push(`BT /F1 11 Tf 1 0 0 1 ${margin.toFixed(2)} ${(pageHeight - margin).toFixed(2)} Tm (No content provided.) Tj ET`);
      }
      flushPage();

      const objects: string[] = [];
      objects[1] = '<< /Type /Catalog /Pages 2 0 R >>';
      const fontObjId1 = 3;
      const fontObjId2 = 4;
      objects[fontObjId1] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>';
      objects[fontObjId2] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>';

      const firstPageObjId = 5;
      const pageObjectIds: number[] = [];
      for (let index = 0; index < pages.length; index += 1) {
        const pageObjId = firstPageObjId + index * 2;
        const contentObjId = pageObjId + 1;
        pageObjectIds.push(pageObjId);

        const stream = pages[index];
        const streamLength = Buffer.byteLength(stream, 'utf8');
        objects[contentObjId] = `<< /Length ${streamLength} >>\nstream\n${stream}\nendstream`;
        objects[pageObjId] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth.toFixed(2)} ${pageHeight.toFixed(2)}] /Resources << /Font << /F1 ${fontObjId1} 0 R /F2 ${fontObjId2} 0 R >> >> /Contents ${contentObjId} 0 R >>`;
      }

      objects[2] = `<< /Type /Pages /Kids [${pageObjectIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pageObjectIds.length} >>`;

      let pdf = '%PDF-1.4\n';
      const xrefOffsets: number[] = [0];
      for (let objId = 1; objId < objects.length; objId += 1) {
        if (!objects[objId]) continue;
        xrefOffsets[objId] = Buffer.byteLength(pdf, 'utf8');
        pdf += `${objId} 0 obj\n${objects[objId]}\nendobj\n`;
      }

      const xrefStart = Buffer.byteLength(pdf, 'utf8');
      pdf += `xref\n0 ${objects.length}\n`;
      pdf += '0000000000 65535 f \n';
      for (let objId = 1; objId < objects.length; objId += 1) {
        const offset = xrefOffsets[objId] ?? 0;
        pdf += `${offset.toString().padStart(10, '0')} 00000 n \n`;
      }

      pdf += `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;
      return Buffer.from(pdf, 'utf8');
    };

    if (format === 'pdf') {
      const pdfBuffer = buildSimplePdf(reportTitle, lines, options?.author);
      const target = options?.targetFileSizeKB;
      const sizeWarning = target && (pdfBuffer.length / 1024) > target * 1.15
        ? `Requested ~${target}KB, produced ${(pdfBuffer.length / 1024).toFixed(0)}KB to preserve quality.`
        : undefined;

      return {
        success: true,
        data: {
          buffer: pdfBuffer.toString('base64'),
          format: 'pdf',
          size: pdfBuffer.length,
          mimeType: 'application/pdf',
          fileName,
          summary: sizeWarning || 'Detailed research report generated in PDF format.',
        },
        type: 'document',
        processingTime: Date.now() - startTime,
        provider: 'native-pdf',
      };
    }

    if (format === 'docx') {
      const titleSize = 38;
      const headingSize = 30;
      const bodySize = 24;
      const bodyLineHeight = 360;
      const metadataSize = 20;
      const sourceLines = normalized.split('\n');
      const markdownTable = extractMarkdownPipeTableFromLines(sourceLines);
      const resolvedDocxTable = tableData || (markdownTable ? { columns: markdownTable.columns, rows: markdownTable.rows } : null);
      const markdownTableConsumed = markdownTable?.consumed || new Set<number>();

      const stripInlineMarkdown = (value: string): string => String(value || '')
        .replace(/!\[[^\]]*\]\([^\)]+\)/g, '')
        .replace(/\[([^\]]+)\]\([^\)]+\)/g, '$1')
        .replace(/\*\*(.*?)\*\*/g, '$1')
        .replace(/__(.*?)__/g, '$1')
        .replace(/\*(.*?)\*/g, '$1')
        .replace(/_(.*?)_/g, '$1')
        .replace(/~~(.*?)~~/g, '$1')
        .replace(/`([^`]+)`/g, '$1')
        .replace(/\\([`*_{}\[\]()#+\-.!|])/g, '$1')
        .replace(/\|/g, ' | ')
        .replace(/\s{2,}/g, ' ')
        .trim();

      const sections: Array<Paragraph | Table> = [];
      sections.push(new Paragraph({
        spacing: { after: 240, line: bodyLineHeight },
        children: [new TextRun({ text: reportTitle, bold: true, size: titleSize })],
      }));
      sections.push(new Paragraph({
        spacing: { after: 160, line: bodyLineHeight },
        children: [new TextRun({ text: `Generated: ${new Date().toLocaleString()}`, size: metadataSize })],
      }));

      for (let lineIndex = 0; lineIndex < sourceLines.length; lineIndex += 1) {
        if (markdownTableConsumed.has(lineIndex)) {
          continue;
        }

        const rawLine = sourceLines[lineIndex];
        const line = rawLine.replace(/\r/g, '');
        const trimmedLine = line.trim();

        if (!trimmedLine) {
          sections.push(new Paragraph({
            spacing: { after: 120, line: bodyLineHeight },
            children: [new TextRun({ text: '', size: bodySize })],
          }));
          continue;
        }

        if (/^#{1,6}\s+/.test(trimmedLine)) {
          const headingText = stripInlineMarkdown(trimmedLine.replace(/^#{1,6}\s+/, '').trim());
          sections.push(new Paragraph({
            spacing: { before: 120, after: 80, line: bodyLineHeight },
            children: [new TextRun({ text: headingText, bold: true, size: headingSize })],
          }));
          continue;
        }

        if (/^[-*]\s+/.test(trimmedLine)) {
          const bulletText = stripInlineMarkdown(trimmedLine.replace(/^[-*]\s+/, '').trim());
          sections.push(new Paragraph({
            bullet: { level: 0 },
            spacing: { after: 80, line: bodyLineHeight },
            children: [new TextRun({ text: bulletText, size: bodySize })],
          }));
          continue;
        }

        if (/^\d+[.)]\s+/.test(trimmedLine)) {
          const orderedMatch = trimmedLine.match(/^(\d+[.)])\s+(.*)$/);
          const orderedText = orderedMatch
            ? `${orderedMatch[1]} ${stripInlineMarkdown(orderedMatch[2])}`
            : stripInlineMarkdown(trimmedLine);
          sections.push(new Paragraph({
            spacing: { after: 80, line: bodyLineHeight },
            children: [new TextRun({ text: orderedText, size: bodySize })],
          }));
          continue;
        }

        if (/^\|.*\|$/.test(trimmedLine) || /^\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)+$/.test(trimmedLine)) {
          continue;
        }

        sections.push(new Paragraph({
          spacing: { after: 120, line: bodyLineHeight },
          children: [new TextRun({ text: stripInlineMarkdown(line), size: bodySize })],
        }));
      }

      if (resolvedDocxTable && resolvedDocxTable.columns.length && resolvedDocxTable.rows.length) {
        sections.push(new Paragraph({
          spacing: { before: 180, after: 100, line: bodyLineHeight },
          children: [new TextRun({ text: 'Table Data', bold: true, size: headingSize })],
        }));

        const maxColumns = Math.max(1, Math.min(resolvedDocxTable.columns.length, 8));
        const headers = resolvedDocxTable.columns.slice(0, maxColumns).map((column, index) => {
          const cleaned = stripInlineMarkdown(column || '').trim();
          return cleaned || `Column ${index + 1}`;
        });
        const visibleRows = resolvedDocxTable.rows
          .slice(0, 200)
          .map((row) => headers.map((_, index) => stripInlineMarkdown(row[index] || '')));

        const docTable = new Table({
          width: {
            size: 100,
            type: WidthType.PERCENTAGE,
          },
          rows: [
            new TableRow({
              tableHeader: true,
              children: headers.map((header) => new TableCell({
                children: [new Paragraph({
                  spacing: { after: 80, line: bodyLineHeight },
                  children: [new TextRun({ text: header, bold: true, size: bodySize })],
                })],
              })),
            }),
            ...visibleRows.map((row) => new TableRow({
              children: row.map((cellText) => new TableCell({
                children: [new Paragraph({
                  spacing: { after: 80, line: bodyLineHeight },
                  children: [new TextRun({ text: cellText || '-', size: bodySize })],
                })],
              })),
            })),
          ],
        });

        sections.push(docTable);
        sections.push(new Paragraph({
          spacing: { after: 120, line: bodyLineHeight },
          children: [new TextRun({ text: '', size: bodySize })],
        }));
      }

      const document = new Document({ sections: [{ children: sections }] });
      const buffer = await Packer.toBuffer(document);

      return {
        success: true,
        data: {
          buffer: buffer.toString('base64'),
          format: 'docx',
          title: reportTitle,
          size: buffer.length,
          mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          fileName,
          summary: 'Detailed research report generated in DOCX format.',
        },
        type: 'document',
        processingTime: Date.now() - startTime,
        provider: 'docx',
      };
    }

    if (format === 'xlsx') {
      const workbook = XLSX.utils.book_new();

      const markdownTable = extractMarkdownPipeTableFromLines(lines);
      const resolvedTable = tableData || (markdownTable ? { columns: markdownTable.columns, rows: markdownTable.rows } : null);

      if (resolvedTable && resolvedTable.columns.length && resolvedTable.rows.length) {
        const headers = resolvedTable.columns.map((col, index) => col || `Column ${index + 1}`);
        const normalizedRows = resolvedTable.rows.map((row) => {
          const normalizedRow: Record<string, string> = {};
          headers.forEach((header, idx) => {
            normalizedRow[header] = row[idx] ?? '';
          });
          return normalizedRow;
        });

        const dataSheet = XLSX.utils.json_to_sheet(normalizedRows, { header: headers });
        dataSheet['!cols'] = headers.map((header) => ({ wch: Math.max(12, Math.min(42, header.length + 6)) }));
        XLSX.utils.book_append_sheet(workbook, dataSheet, 'Data');
      } else {
        const stripMd = (text: string) => text
          .replace(/\*\*(.*?)\*\*/g, '$1')
          .replace(/`([^`]+)`/g, '$1')
          .replace(/^#{1,6}\s+/, '')
          .replace(/^[-*]\s+/, '')
          .replace(/^\d+[.)]\s+/, '')
          .trim();

        const rows = nonEmptyLines
          .map((line) => stripMd(line))
          .filter(Boolean)
          .map((line) => {
            const split = line.match(/^([^:|-]{2,80})\s*[:|-]\s*(.+)$/);
            if (split) {
              return {
                Name: split[1].trim(),
                Details: split[2].trim(),
              };
            }

            const hyphenSplit = line.split(' - ');
            if (hyphenSplit.length > 1) {
              return {
                Name: hyphenSplit[0].trim(),
                Details: hyphenSplit.slice(1).join(' - ').trim(),
              };
            }

            return {
              Name: line,
              Details: '',
            };
          });

        const fallbackSheet = XLSX.utils.json_to_sheet(rows, { header: ['Name', 'Details'] });
        fallbackSheet['!cols'] = [{ wch: 36 }, { wch: 70 }];
        XLSX.utils.book_append_sheet(workbook, fallbackSheet, 'Data');
      }

      const xlsxBuffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }) as Buffer;

      return {
        success: true,
        data: {
          buffer: xlsxBuffer.toString('base64'),
          format: 'xlsx',
          title: reportTitle,
          size: xlsxBuffer.length,
          mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          fileName,
          summary: 'Spreadsheet generated in table format (rows and columns).',
        },
        type: 'document',
        processingTime: Date.now() - startTime,
        provider: 'xlsx',
      };
    }

    if (format === 'markdown') {
      const markdownBuffer = Buffer.from(`# ${reportTitle}\n\n${normalized}`, 'utf-8');
      return {
        success: true,
        data: {
          buffer: markdownBuffer.toString('base64'),
          format: 'markdown',
          title: reportTitle,
          size: markdownBuffer.length,
          mimeType: 'text/markdown',
          fileName,
          summary: 'Detailed report generated in Markdown format.',
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

export async function generateDashboard(prompt: string, attachments?: Array<{ type: string; data: string; name: string }>, options?: { title?: string }): Promise<AIToolResponse> {
  const startTime = Date.now();
  try {
    const userRequest = String(prompt || '').trim();

    const escapeHtml = (value: string): string => String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');

    const toTitleCase = (value: string): string => value
      .replace(/[_-]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/\b\w/g, (char) => char.toUpperCase());

    const escapeRegExp = (value: string): string => String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    const extractRowsFromCsv = (csvText: string): string[][] => {
      return csvText
        .split(/\r?\n/)
        .map((line) => line.split(',').map((cell) => cell.trim()))
        .filter((row) => row.some((cell) => cell.length > 0));
    };

    const parsedTables: Array<{ sourceName: string; rows: string[][] }> = [];
    (attachments || []).forEach((attachment) => {
      if (!attachment.data) return;
      const isCsv = /csv|text\/plain|application\/vnd\.ms-excel/i.test(attachment.type) || /\.csv$/i.test(attachment.name);
      const isExcel = /spreadsheetml|application\/vnd\.ms-excel|excel/i.test(attachment.type) || /\.(xlsx|xls)$/i.test(attachment.name);
      try {
        if (isExcel) {
          const excelBuffer = Buffer.from(attachment.data, 'base64');
          const workbook = XLSX.read(excelBuffer, { type: 'buffer' });
          const firstSheetName = workbook.SheetNames[0];
          if (!firstSheetName) return;
          const firstSheet = workbook.Sheets[firstSheetName];
          const sheetRows = XLSX.utils.sheet_to_json(firstSheet, { header: 1, blankrows: false }) as Array<Array<unknown>>;
          const normalizedRows = sheetRows
            .map((row) => row.map((cell) => String(cell ?? '').trim()))
            .filter((row) => row.some((cell) => cell.length > 0));
          if (normalizedRows.length > 0) {
            parsedTables.push({
              sourceName: attachment.name || `Attachment ${parsedTables.length + 1}`,
              rows: normalizedRows.slice(0, 1501),
            });
          }
          return;
        }

        if (isCsv) {
          const decoded = Buffer.from(attachment.data, 'base64').toString('utf-8');
          const rows = extractRowsFromCsv(decoded);
          if (rows.length > 0) {
            parsedTables.push({
              sourceName: attachment.name || `Attachment ${parsedTables.length + 1}`,
              rows: rows.slice(0, 1501),
            });
          }
        }
      } catch {
      }
    });

    const buildUnifiedDataset = () => {
      if (!parsedTables.length) {
        return {
          headers: ['Metric', 'Value'],
          rows: [['Data points', '0'], ['Note', 'Upload CSV or Excel for richer dashboard']],
        };
      }

      if (parsedTables.length === 1) {
        const single = parsedTables[0].rows;
        const singleHeaders = (single[0] || ['Metric', 'Value']).map((header, index) => {
          const resolved = String(header || '').trim();
          return resolved || `Column ${index + 1}`;
        });
        const singleRows = single
          .slice(1, 5001)
          .map((row) => singleHeaders.map((_, index) => String(row[index] || '').trim()));
        return {
          headers: singleHeaders,
          rows: singleRows,
        };
      }

      const unionHeaders = new Set<string>();
      parsedTables.forEach((table) => {
        const tableHeaders = (table.rows[0] || []).map((header, index) => {
          const resolved = String(header || '').trim();
          return resolved || `Column ${index + 1}`;
        });
        tableHeaders.forEach((header) => unionHeaders.add(header));
      });

      const combinedHeaders = ['Source File', ...Array.from(unionHeaders)];
      const combinedRows: string[][] = [];

      for (const table of parsedTables) {
        const tableHeaders = (table.rows[0] || []).map((header, index) => {
          const resolved = String(header || '').trim();
          return resolved || `Column ${index + 1}`;
        });

        const indexByHeader = new Map<string, number>();
        tableHeaders.forEach((header, index) => {
          indexByHeader.set(header, index);
        });

        for (const row of table.rows.slice(1)) {
          const normalizedRow = combinedHeaders.map((header) => {
            if (header === 'Source File') return table.sourceName;
            const cellIndex = indexByHeader.get(header);
            if (cellIndex === undefined) return '';
            return String(row[cellIndex] || '').trim();
          });
          combinedRows.push(normalizedRow);
          if (combinedRows.length >= 5000) break;
        }

        if (combinedRows.length >= 5000) break;
      }

      return {
        headers: combinedHeaders,
        rows: combinedRows.length
          ? combinedRows
          : [['Multiple files detected', 'No readable rows extracted']].map((row) => {
              const normalized = new Array(combinedHeaders.length).fill('');
              normalized[0] = 'System';
              normalized[1] = row[0];
              if (combinedHeaders.length > 2) normalized[2] = row[1];
              return normalized;
            }),
      };
    };

    const unifiedDataset = buildUnifiedDataset();
    const headers = unifiedDataset.headers.map((header, index) => String(header || '').trim() || `Column ${index + 1}`);
    const rows = unifiedDataset.rows.slice(0, 5000).map((row) => headers.map((_, index) => String(row[index] || '').trim()));

    const normalizeKey = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    const normalizedHeaders = headers.map((header) => normalizeKey(header));

    const findHeaderIndexFromPhrase = (phrase?: string | null): number => {
      if (!phrase) return -1;
      const normalizedPhrase = normalizeKey(phrase);
      if (!normalizedPhrase) return -1;

      let index = normalizedHeaders.findIndex((header) => header === normalizedPhrase);
      if (index >= 0) return index;

      index = normalizedHeaders.findIndex((header) => header.includes(normalizedPhrase) || normalizedPhrase.includes(header));
      return index;
    };

    const parseNumeric = (value: string): number | null => {
      const cleaned = String(value || '').replace(/,/g, '').replace(/%/g, '').trim();
      if (!cleaned) return null;
      const num = Number(cleaned);
      return Number.isFinite(num) ? num : null;
    };

    const isIdentifierHeader = (header: string) => {
      const normalized = String(header || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
      if (!normalized) return false;
      return /(^|\s)(id|ids|row id|record id|identifier|index|serial|serial no|s no|sr no|sno)(\s|$)/i.test(normalized);
    };

    const isTemporalHeader = (header: string) => {
      const normalized = String(header || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
      if (!normalized) return false;
      return /(^|\s)(date|day|week|month|quarter|year|time|timestamp|fy|fiscal year|period)(\s|$)/i.test(normalized);
    };

    const isBusinessMetricHeader = (header: string) => {
      const normalized = String(header || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
      if (!normalized) return false;
      return /(^|\s)(sales|revenue|amount|total|price|cost|profit|value|score|quantity|qty|unit|units|volume|gmv|income|expense|margin)(\s|$)/i.test(normalized);
    };

    const getNumericCoverage = (index: number) => rows.reduce((count, row) => count + (parseNumeric(row[index] || '') !== null ? 1 : 0), 0);

    const numericThreshold = Math.max(3, Math.floor(rows.length * 0.35));

    let metricColumnIndex = -1;

    const headerMentionedInPrompt = (header: string) => userRequest.toLowerCase().includes(header.toLowerCase());
    const hintedBusinessMetric = headers.findIndex((header, index) => {
      if (isIdentifierHeader(header) || isTemporalHeader(header)) return false;
      if (!headerMentionedInPrompt(header) || !isBusinessMetricHeader(header)) return false;
      return getNumericCoverage(index) >= numericThreshold;
    });
    if (hintedBusinessMetric >= 0) metricColumnIndex = hintedBusinessMetric;

    if (metricColumnIndex === -1) {
      const firstBusinessMetric = headers.findIndex((header, index) => {
        if (isIdentifierHeader(header) || isTemporalHeader(header)) return false;
        if (!isBusinessMetricHeader(header)) return false;
        return getNumericCoverage(index) >= numericThreshold;
      });
      if (firstBusinessMetric >= 0) metricColumnIndex = firstBusinessMetric;
    }

    if (metricColumnIndex === -1) {
      for (let col = 0; col < headers.length; col += 1) {
        if (isIdentifierHeader(headers[col] || '') || isTemporalHeader(headers[col] || '')) continue;
        const numericCount = getNumericCoverage(col);
        if (numericCount >= numericThreshold) {
          metricColumnIndex = col;
          break;
        }
      }
    }

    if (metricColumnIndex === -1) {
      for (let col = 0; col < headers.length; col += 1) {
        if (isIdentifierHeader(headers[col] || '')) continue;
        const numericCount = getNumericCoverage(col);
        if (numericCount >= numericThreshold) {
          metricColumnIndex = col;
          break;
        }
      }
    }

    if (metricColumnIndex >= 0 && isIdentifierHeader(headers[metricColumnIndex] || '')) {
      metricColumnIndex = -1;
    }

    if (metricColumnIndex >= 0 && isTemporalHeader(headers[metricColumnIndex] || '')) {
      metricColumnIndex = -1;
    }

    const labelColumnIndex = metricColumnIndex === 0 && headers.length > 1 ? 1 : 0;

    const inferTitle = (): string => {
      const explicitTitle = options?.title && !/^ai dashboard$/i.test(options.title) ? options.title : '';
      if (explicitTitle) return explicitTitle;

      const fileName = attachments?.[0]?.name || '';
      const base = fileName.replace(/\.[^.]+$/, '').trim();
      if (base && !/^(data|dataset|report|sheet|table)$/i.test(base)) {
        return `${toTitleCase(base)} Dashboard`;
      }

      const labelHeader = headers[labelColumnIndex] || '';
      if (labelHeader) {
        return `${toTitleCase(labelHeader)} Insights Dashboard`;
      }

      return 'Data Insights Dashboard';
    };

    const dashboardTitle = inferTitle();

    const defaultDashboardSummary = 'Responsive dashboard created from uploaded dataset. Click preview to open interactive full view.';

    const generateLlmDashboardSummary = async (): Promise<string> => {
      const openAiApiKey = process.env.OPENAI_API_KEY;
      if (!openAiApiKey) {
        return defaultDashboardSummary;
      }

      try {
        const model = process.env.OPENAI_DASHBOARD_MODEL || process.env.OPENAI_MODEL || 'gpt-4o-mini';
        const sampleRows = rows.slice(0, 8);
        const payload = {
          title: dashboardTitle,
          request: userRequest || 'Generate a dashboard',
          rowCount: rows.length,
          columnCount: headers.length,
          metricColumn: metricColumnIndex >= 0 ? headers[metricColumnIndex] : null,
          groupByColumn: groupByColumnIndex >= 0 ? headers[groupByColumnIndex] : null,
          headers,
          sampleRows,
        };

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3000);

        const response = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${openAiApiKey}`,
          },
          body: JSON.stringify({
            model,
            temperature: 0.2,
            max_tokens: 120,
            messages: [
              {
                role: 'system',
                content: 'Write exactly 1-2 concise sentences describing dashboard insights. No markdown. No bullet points. Keep it factual and user-friendly.',
              },
              {
                role: 'user',
                content: `Summarize this dashboard context as a preview message: ${JSON.stringify(payload)}`,
              },
            ],
          }),
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          return defaultDashboardSummary;
        }

        const llmData = await response.json() as {
          choices?: Array<{ message?: { content?: string } }>;
        };

        const llmSummary = String(llmData.choices?.[0]?.message?.content || '')
          .replace(/\s+/g, ' ')
          .trim();

        if (!llmSummary) {
          return defaultDashboardSummary;
        }

        return llmSummary.length > 260
          ? `${llmSummary.slice(0, 257).trimEnd()}...`
          : llmSummary;
      } catch {
        return defaultDashboardSummary;
      }
    };

    const dashboardSummaryPromise = generateLlmDashboardSummary();

    const topNMatch = userRequest.match(/\btop\s+(\d{1,3})\b/i);
    const requestedTopN = topNMatch ? Math.max(1, Math.min(100, Number(topNMatch[1] || 0))) : null;

    const sortByMatch = userRequest.match(/\bsort(?:ed)?\s+by\s+([a-z0-9_\- ]{2,60})/i);
    const groupByMatch = userRequest.match(/\bgroup(?:ed)?\s+by\s+([a-z0-9_\- ]{2,60})/i);
    const perByMatch = userRequest.match(/\bper\s+([a-z0-9_\- ]{2,60})/i);

    const sortByColumnIndex = findHeaderIndexFromPhrase(sortByMatch?.[1] || null);
    const groupByColumnIndex = findHeaderIndexFromPhrase(groupByMatch?.[1] || perByMatch?.[1] || null);
    const sortDirection: 'asc' | 'desc' = /\b(desc|descending|highest|largest|top)\b/i.test(userRequest) ? 'desc' : 'asc';

    const pageSizeMatch = userRequest.match(/\b(?:page\s*size|rows\s*per\s*page|show\s*)(\d{1,3})\b/i);
    const requestedPageSize = pageSizeMatch ? Math.max(10, Math.min(200, Number(pageSizeMatch[1] || 25))) : 25;
    const compactTable = /\b(compact|dense)\b/i.test(userRequest);
    const stripedTable = !/\b(no\s+stripe|without\s+stripes?|plain\s+rows?)\b/i.test(userRequest);
    const freezeFirstColumn = /\b(freeze|pin|sticky)\s+(first\s+)?column\b/i.test(userRequest);
    const agGridEnablePivot = /\b(pivot|cross[\s-]?tab)\b/i.test(userRequest);
    const agGridShowRowGroupPanel = /\b(group\s*panel|row\s*group\s*panel|grouping\s*panel)\b/i.test(userRequest) || groupByColumnIndex >= 0;
    const agGridFitColumns = /\b(fit\s+columns?|auto[\s-]?fit|size\s+to\s+fit|full\s*width\s*columns?)\b/i.test(userRequest);
    const agGridAutoSizeColumns = /\b(auto[\s-]?size\s*columns?|fit\s+content|content\s+width)\b/i.test(userRequest);
    const agGridShowStatusBar = /\b(status\s*bar|statusbar|aggregate|aggregation|sum|average|avg|min|max)\b/i.test(userRequest);
    const agGridWrapText = /\b(wrap|multi[\s-]?line)\b/i.test(userRequest);
    const agGridLockColumns = /\b(lock\s+columns?|fixed\s+columns?)\b/i.test(userRequest);

    const visibleColumns = headers.map(() => true);
    headers.forEach((header, index) => {
      const escaped = escapeRegExp(header);
      if (new RegExp(`\\b(hide|exclude|remove)\\s+(the\\s+)?${escaped}\\b`, 'i').test(userRequest)) {
        visibleColumns[index] = false;
      }
    });

    if (/\b(show only|only show|include only)\b/i.test(userRequest)) {
      const mentioned = headers.map((header) => headerMentionedInPrompt(header));
      if (mentioned.some(Boolean)) {
        mentioned.forEach((isMentioned, index) => {
          visibleColumns[index] = isMentioned;
        });
      }
    }

    if (!visibleColumns.some(Boolean)) {
      visibleColumns.fill(true);
    }

    const wantsFilters = /\b(filter|filters|slicer|slice|dropdown|segment|by\s+)\b/i.test(userRequest);
    const wantsTable = !/\b(no table|without table|hide table)\b/i.test(userRequest);
    const requestedChartType = /\bpie\b/i.test(userRequest)
      ? 'pie'
      : /\bline\b/i.test(userRequest)
        ? 'line'
        : /\bbar\b|\bcolumn\b/i.test(userRequest)
          ? 'bar'
          : 'bar';

    const categoricalColumns = headers
      .map((header, index) => ({
        index,
        header,
        uniqueCount: new Set(rows.map((row) => row[index]).filter(Boolean)).size,
      }))
      .filter((item) => {
        const numericRatio = rows.length
          ? rows.filter((row) => parseNumeric(row[item.index] || '') !== null).length / rows.length
          : 0;
        return numericRatio < 0.7 && item.uniqueCount > 1 && item.uniqueCount <= 80;
      });

    const preferredFilterColumns = categoricalColumns
      .filter((item) => headerMentionedInPrompt(item.header))
      .slice(0, 4)
      .map((item) => item.index);

    const filterColumnIndexes = (preferredFilterColumns.length ? preferredFilterColumns : categoricalColumns.slice(0, 3).map((item) => item.index));
    const showFilters = wantsFilters || filterColumnIndexes.length > 0;

    const kpiCount = rows.length;
    const sourceCount = (attachments || []).length;
    const queryLower = userRequest.toLowerCase();
    const hasTotalIntent = /\b(total|sum|overall|aggregate)\b/i.test(queryLower);
    const hasAverageIntent = /\b(average|avg|mean)\b/i.test(queryLower);
    const hasMedianIntent = /\bmedian\b/i.test(queryLower);
    const hasCountIntent = /\bcount\b|\bnumber of\b/i.test(queryLower);
    const hasComparisonIntent = /\b(compare|comparison|vs\b|versus|difference|variance|delta)\b/i.test(queryLower);
    const hasGrowthIntent = /\b(growth|trend|change|increase|decrease)\b/i.test(queryLower);
    const hasPerIntent = /\bper\s+[a-z0-9_\- ]{2,60}\b/i.test(queryLower);

    const metricHeader = metricColumnIndex >= 0 ? headers[metricColumnIndex] : 'Metric';
    const metricLabel = metricColumnIndex >= 0 && !isTemporalHeader(metricHeader) ? metricHeader : '';
    const groupHeader = groupByColumnIndex >= 0 ? headers[groupByColumnIndex] : 'Group';

    const primaryKpiMode = metricColumnIndex < 0
      ? 'count'
      : hasTotalIntent || hasPerIntent || groupByColumnIndex >= 0
        ? 'sum'
        : hasMedianIntent
          ? 'median'
          : hasCountIntent
            ? 'count'
            : hasAverageIntent
              ? 'avg'
              : 'avg';

    const secondaryKpiMode = metricColumnIndex < 0
      ? 'distinct'
      : groupByColumnIndex >= 0
        ? 'group-count'
        : hasComparisonIntent
          ? 'variance'
          : hasGrowthIntent
            ? 'range'
            : 'median';

    const primaryKpiLabel = primaryKpiMode === 'sum'
      ? (metricLabel ? `Total ${metricLabel}` : 'Total')
      : primaryKpiMode === 'median'
        ? (metricLabel ? `Median ${metricLabel}` : 'Median')
        : primaryKpiMode === 'count'
          ? 'Count'
          : (metricLabel ? `Average ${metricLabel}` : 'Average');

    const secondaryKpiLabel = secondaryKpiMode === 'group-count'
      ? `${groupHeader} groups`
      : secondaryKpiMode === 'variance'
        ? (metricLabel ? `Variance ${metricLabel}` : 'Variance')
        : secondaryKpiMode === 'range'
          ? (metricLabel ? `Range ${metricLabel}` : 'Range')
          : secondaryKpiMode === 'distinct'
            ? 'Distinct values'
            : (metricLabel ? `Median ${metricLabel}` : 'Median');

    const headersJson = JSON.stringify(headers);
    const rowsJson = JSON.stringify(rows);
    const filterIndexesJson = JSON.stringify(filterColumnIndexes);
    const requestedTopNJson = requestedTopN ?? -1;
    const sortByColumnIndexJson = sortByColumnIndex;
    const groupByColumnIndexJson = groupByColumnIndex;
    const sortDirectionJson = JSON.stringify(sortDirection);
    const visibleColumnsJson = JSON.stringify(visibleColumns);
    const requestedPageSizeJson = requestedPageSize;
    const compactTableJson = compactTable ? 'true' : 'false';
    const stripedTableJson = stripedTable ? 'true' : 'false';
    const freezeFirstColumnJson = freezeFirstColumn ? 'true' : 'false';
    const agGridEnablePivotJson = agGridEnablePivot ? 'true' : 'false';
    const agGridShowRowGroupPanelJson = agGridShowRowGroupPanel ? 'true' : 'false';
    const agGridFitColumnsJson = agGridFitColumns ? 'true' : 'false';
    const agGridAutoSizeColumnsJson = agGridAutoSizeColumns ? 'true' : 'false';
    const agGridShowStatusBarJson = agGridShowStatusBar ? 'true' : 'false';
    const agGridWrapTextJson = agGridWrapText ? 'true' : 'false';
    const agGridLockColumnsJson = agGridLockColumns ? 'true' : 'false';
    const primaryKpiModeJson = JSON.stringify(primaryKpiMode);
    const secondaryKpiModeJson = JSON.stringify(secondaryKpiMode);
    const primaryKpiLabelEscaped = escapeHtml(primaryKpiLabel);
    const secondaryKpiLabelEscaped = escapeHtml(secondaryKpiLabel);

    const requestedTheme = /\b(light|minimal|executive|glass|dark)\b/i.exec(userRequest)?.[1]?.toLowerCase() || 'dark';
    const agGridThemeClass = requestedTheme === 'light' ? 'ag-theme-alpine' : 'ag-theme-alpine-dark';
    const themeOverrides = requestedTheme === 'light'
      ? `
    body { background: #f4f7fb; color: #182033; }
    .filter-card, .chart-panel, .table-panel, .card { background: #ffffff; border-color: #d8dfeb; }
    .label, .filter-label, .panel-title, th { color: #4c5a78; }
    .bar-track { background: #e9eef7; border-color: #d8dfeb; }
    table { background: #ffffff; }
    th, td { border-bottom-color: #e5eaf3; color: #1f2a44; }
      `
      : requestedTheme === 'minimal'
        ? `
    body { background: #0f1115; color: #e5e7eb; }
    .filter-card, .chart-panel, .table-panel, .card { background: #171a21; border-color: #2a2f3a; }
    .label, .filter-label, .panel-title, th { color: #9ca3af; }
    .bar-track { background: #1f2430; border-color: #313846; }
    .bar-fill { background: linear-gradient(90deg, #8b9bb4, #6f7f99); }
      `
        : requestedTheme === 'executive'
          ? `
    body { background: #090d1c; color: #ecf1ff; }
    .filter-card, .chart-panel, .table-panel, .card { background: linear-gradient(180deg, #151d3a, #121934); border-color: #334375; }
    .label, .filter-label, .panel-title, th { color: #aebdf1; }
    .bar-fill { background: linear-gradient(90deg, #4f8cff, #6f5bff); }
      `
          : requestedTheme === 'glass'
            ? `
    body { background: radial-gradient(circle at 20% 20%, #1b2552, #0c1226); color: #edf2ff; }
    .filter-card, .chart-panel, .table-panel, .card { background: rgba(22, 30, 62, 0.55); border-color: rgba(135, 152, 204, 0.35); backdrop-filter: blur(8px); }
    .label, .filter-label, .panel-title, th { color: #b9c7f6; }
    .bar-track { background: rgba(41, 56, 106, 0.5); border-color: rgba(135, 152, 204, 0.35); }
      `
            : '';

    const agGridThemeOverrides = requestedTheme === 'light'
      ? `
    .ag-theme-alpine {
      --ag-background-color: #ffffff;
      --ag-foreground-color: #1f2a44;
      --ag-header-background-color: #f2f6fd;
      --ag-header-foreground-color: #4c5a78;
      --ag-border-color: #d8dfeb;
      --ag-row-border-color: #e5eaf3;
      --ag-odd-row-background-color: #fafcff;
      --ag-selected-row-background-color: rgba(88, 164, 255, 0.14);
      --ag-alpine-active-color: #3d7bf4;
    }
    .ag-theme-alpine .ag-paging-panel,
    .ag-theme-alpine .ag-status-bar {
      border-top: 1px solid #d8dfeb;
      color: #4c5a78;
    }
      `
      : requestedTheme === 'minimal'
        ? `
    .ag-theme-alpine-dark {
      --ag-background-color: #171a21;
      --ag-foreground-color: #e5e7eb;
      --ag-header-background-color: #1f2430;
      --ag-header-foreground-color: #9ca3af;
      --ag-border-color: #2a2f3a;
      --ag-row-border-color: #2f3644;
      --ag-odd-row-background-color: rgba(255,255,255,0.015);
      --ag-selected-row-background-color: rgba(139,155,180,0.2);
      --ag-alpine-active-color: #8b9bb4;
    }
        `
        : requestedTheme === 'executive'
          ? `
    .ag-theme-alpine-dark {
      --ag-background-color: #121934;
      --ag-foreground-color: #ecf1ff;
      --ag-header-background-color: #172246;
      --ag-header-foreground-color: #aebdf1;
      --ag-border-color: #334375;
      --ag-row-border-color: #2d3e72;
      --ag-odd-row-background-color: rgba(255,255,255,0.02);
      --ag-selected-row-background-color: rgba(79,140,255,0.18);
      --ag-alpine-active-color: #4f8cff;
    }
        `
          : requestedTheme === 'glass'
            ? `
    .ag-theme-alpine-dark {
      --ag-background-color: rgba(22, 30, 62, 0.55);
      --ag-foreground-color: #edf2ff;
      --ag-header-background-color: rgba(35, 49, 96, 0.7);
      --ag-header-foreground-color: #b9c7f6;
      --ag-border-color: rgba(135, 152, 204, 0.35);
      --ag-row-border-color: rgba(135, 152, 204, 0.25);
      --ag-odd-row-background-color: rgba(255,255,255,0.03);
      --ag-selected-row-background-color: rgba(88,164,255,0.22);
      --ag-alpine-active-color: #86b2ff;
    }
        `
            : `
    .ag-theme-alpine-dark {
      --ag-background-color: #121933;
      --ag-foreground-color: #e8ecf7;
      --ag-header-background-color: #161f3f;
      --ag-header-foreground-color: #a8b0d8;
      --ag-border-color: #2b335c;
      --ag-row-border-color: #24315d;
      --ag-odd-row-background-color: rgba(255,255,255,0.02);
      --ag-selected-row-background-color: rgba(88,164,255,0.16);
      --ag-alpine-active-color: #58a4ff;
    }
            `;

    const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(dashboardTitle)}</title>
  <style>
    * { box-sizing: border-box; }
    body { font-family: Inter, Segoe UI, Arial, sans-serif; margin: 0; min-height: 100vh; padding: max(12px, env(safe-area-inset-top)) max(12px, env(safe-area-inset-right)) max(12px, env(safe-area-inset-bottom)) max(12px, env(safe-area-inset-left)); background: #0b1020; color: #e8ecf7; overflow-x: hidden; }
    .wrapper { max-width: 1320px; width: 100%; margin: 0 auto; display: flex; flex-direction: column; gap: 14px; }
    .header { display: flex; flex-direction: column; gap: 8px; }
    .header h1 { margin: 0; font-size: 24px; }
    .filters { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 10px; }
    .filter-card { background: #121933; border: 1px solid #293055; border-radius: 10px; padding: 10px; }
    .filter-label { display: block; font-size: 11px; color: #a8b0d8; margin-bottom: 6px; text-transform: uppercase; letter-spacing: 0.08em; }
    .filter-select { width: 100%; border-radius: 8px; border: 1px solid #313c6b; background: #0f1530; color: #e8ecf7; padding: 8px; }
    .kpi-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 12px; }
    .card { background: linear-gradient(180deg, #151c38, #11172f); border: 1px solid #2b335c; border-radius: 12px; padding: 14px; }
    .label { color: #a8b0d8; font-size: 11px; text-transform: uppercase; letter-spacing: 0.1em; }
    .value { font-size: 26px; font-weight: 700; margin-top: 8px; }
    .layout { display: grid; grid-template-columns: minmax(0, 0.95fr) minmax(0, 1.35fr); gap: 12px; }
    .chart-panel, .table-panel { background: #121933; border: 1px solid #293055; border-radius: 12px; padding: 14px; min-height: 260px; }
    .table-panel-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-bottom: 10px; }
    .panel-title { margin: 0 0 12px; font-size: 13px; text-transform: uppercase; letter-spacing: 0.08em; color: #a8b0d8; }
    .table-panel-head .panel-title { margin: 0; }
    .table-fullscreen-toggle { border: 1px solid #313c6b; background: #0f1530; color: #b8c0e8; border-radius: 8px; padding: 6px 10px; font-size: 11px; text-transform: uppercase; letter-spacing: 0.06em; cursor: pointer; }
    .table-fullscreen-toggle:hover { color: #e8ecf7; border-color: #58a4ff; }
    .bar-row { display: grid; grid-template-columns: 110px 1fr 72px; gap: 8px; align-items: center; margin-bottom: 8px; }
    .bar-label, .bar-value { font-size: 12px; color: #d9e1ff; }
    .bar-track { width: 100%; height: 12px; border-radius: 999px; background: #1d2546; overflow: hidden; border: 1px solid #313c6b; }
    .bar-fill { height: 100%; background: linear-gradient(90deg, #58a4ff, #7c7cff); }
    .line-wrap { width: 100%; min-height: 220px; display: flex; align-items: center; justify-content: center; }
    .line-svg { width: 100%; height: 220px; }
    .pie-wrap { display: grid; grid-template-columns: 180px 1fr; gap: 12px; align-items: center; }
    .pie-chart { width: 170px; height: 170px; border-radius: 999px; border: 1px solid #2f3866; }
    .pie-legend { display: flex; flex-direction: column; gap: 6px; }
    .legend-item { display: flex; align-items: center; gap: 8px; font-size: 12px; color: #d9e1ff; }
    .legend-color { width: 10px; height: 10px; border-radius: 2px; }
    .table-tools { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin-bottom: 10px; }
    .table-input, .table-select { border-radius: 8px; border: 1px solid #313c6b; background: #0f1530; color: #e8ecf7; padding: 7px 9px; font-size: 12px; }
    .table-input { min-width: 190px; flex: 1; }
    .table-action { border-radius: 8px; border: 1px solid #313c6b; background: #0f1530; color: #d8def8; padding: 7px 10px; font-size: 12px; cursor: pointer; }
    .table-action:hover { border-color: #58a4ff; color: #ffffff; }
    .table-wrap { width: 100%; max-width: 100%; overflow: hidden; border: 1px solid #293055; border-radius: 10px; }
    #agGridRoot { width: 100%; height: min(62vh, 560px); }
    .ag-theme-alpine, .ag-theme-alpine-dark {
      --ag-font-family: Inter, Segoe UI, Arial, sans-serif;
      --ag-font-size: 12px;
      --ag-cell-horizontal-padding: 10px;
      --ag-header-height: 38px;
    }
    .ag-theme-alpine.compact-grid, .ag-theme-alpine-dark.compact-grid {
      --ag-font-size: 11px;
      --ag-grid-size: 4px;
      --ag-header-height: 32px;
      --ag-row-height: 30px;
    }
    .ag-theme-alpine .ag-paging-panel,
    .ag-theme-alpine .ag-status-bar,
    .ag-theme-alpine-dark .ag-paging-panel,
    .ag-theme-alpine-dark .ag-status-bar {
      border-top: 1px solid var(--ag-border-color);
      color: var(--ag-header-foreground-color);
    }
    .ag-theme-alpine .ag-cell.table-cell-selected,
    .ag-theme-alpine-dark .ag-cell.table-cell-selected {
      outline: 1.5px solid var(--ag-alpine-active-color);
      outline-offset: -2px;
      background: color-mix(in srgb, var(--ag-selected-row-background-color) 72%, transparent);
    }
    .ag-theme-alpine.striped-grid .ag-row.ag-row-odd:not(.ag-row-selected) .ag-cell,
    .ag-theme-alpine-dark.striped-grid .ag-row.ag-row-odd:not(.ag-row-selected) .ag-cell {
      background-color: var(--ag-odd-row-background-color);
    }
    .table-footer { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 8px; margin-top: 10px; }

    body.table-fullscreen .header,
    body.table-fullscreen .filters,
    body.table-fullscreen .kpi-grid,
    body.table-fullscreen .chart-panel {
      display: none !important;
    }
    body.table-fullscreen .layout {
      display: block;
    }
    body.table-fullscreen .table-panel {
      position: fixed;
      inset: 10px;
      z-index: 9999;
      margin: 0;
      border-radius: 12px;
      min-height: calc(100dvh - 20px);
      max-height: calc(100dvh - 20px);
      overflow: hidden;
    }
    body.table-fullscreen .table-wrap {
      height: calc(100dvh - 170px);
    }
    body.table-fullscreen #agGridRoot {
      height: calc(100dvh - 170px);
    }
    @media (max-width: 980px) {
      .layout { grid-template-columns: 1fr; }
      .bar-row { grid-template-columns: 1fr; gap: 4px; }
      .bar-track { height: 10px; }
      .pie-wrap { grid-template-columns: 1fr; }
      #agGridRoot { height: min(58vh, 460px); }
    }
    ${themeOverrides}
    ${agGridThemeOverrides}
  </style>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/ag-grid-community/styles/ag-grid.css" />
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/ag-grid-community/styles/ag-theme-alpine.css" />
  <script src="https://cdn.jsdelivr.net/npm/ag-grid-community/dist/ag-grid-community.min.js"></script>
</head>
<body>
  <div class="wrapper">
    <div class="header">
      <h1>${escapeHtml(dashboardTitle)}</h1>
    </div>

    ${showFilters ? `<section class="filters" id="filtersPanel"></section>` : ''}

    <div class="kpi-grid">
      <div class="card"><div class="label">Rows analyzed</div><div class="value" id="kpi-rows">${kpiCount}</div></div>
      <div class="card"><div class="label">Columns</div><div class="value" id="kpi-columns">${headers.length}</div></div>
      <div class="card"><div class="label">Source files</div><div class="value" id="kpi-sources">${sourceCount}</div></div>
      <div class="card"><div class="label" id="kpi-primary-label">${primaryKpiLabelEscaped}</div><div class="value" id="kpi-primary-value">—</div></div>
      <div class="card"><div class="label" id="kpi-secondary-label">${secondaryKpiLabelEscaped}</div><div class="value" id="kpi-secondary-value">—</div></div>
      <div class="card"><div class="label" id="kpi-selection-label">Selected total</div><div class="value" id="kpi-selection-value">—</div></div>
    </div>

    <div class="layout">
      <section class="chart-panel">
        <h2 class="panel-title" id="chartTitle">${metricColumnIndex >= 0 ? `Top ${escapeHtml(headers[metricColumnIndex])} values` : 'Chart insights'}</h2>
        <div id="chartRoot"></div>
      </section>

      <section class="table-panel" style="${wantsTable ? '' : 'display:none;'}">
        <div class="table-panel-head">
          <h2 class="panel-title">Advanced data table</h2>
          <button id="tableFullscreenToggle" type="button" class="table-fullscreen-toggle" aria-pressed="false">Fullscreen Table</button>
        </div>
        <div class="table-tools">
          <input id="tableQuickFilter" class="table-input" type="text" placeholder="Quick filter across all columns" />
          <select id="tablePageSize" class="table-select">
            <option value="10">10 rows</option>
            <option value="25">25 rows</option>
            <option value="50">50 rows</option>
            <option value="100">100 rows</option>
            <option value="200">200 rows</option>
          </select>
          <button id="clearSelectionBtn" type="button" class="table-action">Clear Selection</button>
        </div>
        <div class="table-wrap">
          <div id="agGridRoot" class="${agGridThemeClass}"></div>
        </div>
        <div class="table-footer">
          <div id="tableSummary" style="font-size:12px;color:#b8c0e8;">0 rows</div>
        </div>
      </section>
    </div>
  </div>

  <script>
    const HEADERS = ${headersJson};
    const ROWS = ${rowsJson};
    const FILTER_COLS = ${filterIndexesJson};
    const METRIC_COL = ${metricColumnIndex};
    const LABEL_COL = ${labelColumnIndex};
    const CHART_TYPE = ${JSON.stringify(requestedChartType)};
    const TOP_N = ${requestedTopNJson};
    const SORT_BY_COL = ${sortByColumnIndexJson};
    const GROUP_BY_COL = ${groupByColumnIndexJson};
    const SORT_DIR = ${sortDirectionJson};
    const INITIAL_VISIBLE_COLS = ${visibleColumnsJson};
    const DEFAULT_PAGE_SIZE = ${requestedPageSizeJson};
    const TABLE_COMPACT = ${compactTableJson};
    const TABLE_STRIPED = ${stripedTableJson};
    const TABLE_FREEZE_FIRST_COL = ${freezeFirstColumnJson};
    const AG_GRID_ENABLE_PIVOT = ${agGridEnablePivotJson};
    const AG_GRID_SHOW_GROUP_PANEL = ${agGridShowRowGroupPanelJson};
    const AG_GRID_FIT_COLUMNS = ${agGridFitColumnsJson};
    const AG_GRID_AUTO_SIZE_COLUMNS = ${agGridAutoSizeColumnsJson};
    const AG_GRID_SHOW_STATUS_BAR = ${agGridShowStatusBarJson};
    const AG_GRID_WRAP_TEXT = ${agGridWrapTextJson};
    const AG_GRID_LOCK_COLUMNS = ${agGridLockColumnsJson};
    const PRIMARY_KPI_MODE = ${primaryKpiModeJson};
    const SECONDARY_KPI_MODE = ${secondaryKpiModeJson};

    const tableState = {
      quickFilter: '',
      pageSize: DEFAULT_PAGE_SIZE,
      visibleCols: Array.isArray(INITIAL_VISIBLE_COLS) && INITIAL_VISIBLE_COLS.length === HEADERS.length
        ? INITIAL_VISIBLE_COLS.slice()
        : HEADERS.map(() => true),
    };

    let gridApi = null;
    const manualSelectedCells = new Map();

    const parseNumeric = (value) => {
      const cleaned = String(value || '').replace(/,/g, '').replace(/%/g, '').trim();
      if (!cleaned) return null;
      const n = Number(cleaned);
      return Number.isFinite(n) ? n : null;
    };

    const escapeHtml = (value) => String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');

    const getFilterState = () => {
      const state = {};
      FILTER_COLS.forEach((idx) => {
        const el = document.getElementById('filter-' + idx);
        state[idx] = el ? el.value : 'ALL';
      });
      return state;
    };

    const getFilteredRows = () => {
      const state = getFilterState();
      return ROWS.filter((row) => FILTER_COLS.every((idx) => {
        const value = state[idx];
        if (!value || value === 'ALL') return true;
        return String(row[idx] || '') === value;
      }));
    };

    const applyDataTransforms = (inputRows) => {
      let transformed = inputRows.slice();

      if (GROUP_BY_COL >= 0 && METRIC_COL >= 0) {
        const grouped = new Map();
        transformed.forEach((row) => {
          const key = String(row[GROUP_BY_COL] || 'Unknown');
          const metric = parseNumeric(row[METRIC_COL] || '') || 0;
          grouped.set(key, (grouped.get(key) || 0) + metric);
        });

        transformed = Array.from(grouped.entries()).map(([group, total]) => {
          const base = new Array(HEADERS.length).fill('');
          base[GROUP_BY_COL] = group;
          base[METRIC_COL] = String(Math.round(total * 100) / 100);
          return base;
        });
      }

      if (SORT_BY_COL >= 0) {
        transformed = transformed.slice().sort((a, b) => {
          const aRaw = String(a[SORT_BY_COL] || '');
          const bRaw = String(b[SORT_BY_COL] || '');
          const aNum = parseNumeric(aRaw);
          const bNum = parseNumeric(bRaw);

          let result = 0;
          if (aNum !== null && bNum !== null) {
            result = aNum - bNum;
          } else {
            result = aRaw.localeCompare(bRaw, undefined, { numeric: true, sensitivity: 'base' });
          }

          return SORT_DIR === 'desc' ? -result : result;
        });
      } else if (TOP_N > 0 && METRIC_COL >= 0) {
        transformed = transformed.slice().sort((a, b) => {
          const aNum = parseNumeric(String(a[METRIC_COL] || '')) || 0;
          const bNum = parseNumeric(String(b[METRIC_COL] || '')) || 0;
          return bNum - aNum;
        });
      }

      if (TOP_N > 0) {
        transformed = transformed.slice(0, TOP_N);
      }

      return transformed;
    };

    const renderFilters = () => {
      const panel = document.getElementById('filtersPanel');
      if (!panel || !FILTER_COLS.length) return;
      panel.innerHTML = FILTER_COLS.map((idx) => {
        const values = Array.from(new Set(ROWS.map((row) => String(row[idx] || '')).filter(Boolean))).slice(0, 120);
        const optionItems = ['<option value="ALL">All</option>'].concat(values.map((value) => '<option value="' + escapeHtml(value) + '">' + escapeHtml(value) + '</option>')).join('');
        const label = escapeHtml(HEADERS[idx] || ('Column ' + (idx + 1)));
        return '<div class="filter-card"><label class="filter-label">' + label + '</label><select id="filter-' + idx + '" class="filter-select">' + optionItems + '</select></div>';
      }).join('');

      FILTER_COLS.forEach((idx) => {
        const el = document.getElementById('filter-' + idx);
        if (el) el.addEventListener('change', renderAll);
      });
    };

    const applyQuickFilter = (rows) => {
      const query = String(tableState.quickFilter || '').trim().toLowerCase();
      if (!query) return rows;
      return rows.filter((row) => row.some((cell, colIndex) => {
        if (!tableState.visibleCols[colIndex]) return false;
        return String(cell || '').toLowerCase().includes(query);
      }));
    };

    const getCellSelectionKey = (rowNode, colId) => {
      const rowToken = rowNode && (rowNode.id ?? rowNode.rowIndex ?? 'row');
      return String(rowToken) + '::' + String(colId || '');
    };

    const selectionState = {
      anchorRowIndex: null,
      anchorColId: null,
      pendingShiftRangeFromKeyboard: false,
    };

    const getVisibleColIds = () => HEADERS
      .map((_, index) => ({ index, colId: 'c_' + index }))
      .filter(({ index }) => tableState.visibleCols[index])
      .map(({ colId }) => colId);

    const getColIndexFromId = (colId) => {
      const raw = String(colId || '').replace(/^c_/, '');
      const parsed = Number(raw);
      return Number.isFinite(parsed) ? parsed : -1;
    };

    const getHeaderFromColId = (colId) => {
      const index = getColIndexFromId(colId);
      return index >= 0 ? (HEADERS[index] || colId) : colId;
    };

    const setSelectionAnchor = (rowIndex, colId) => {
      selectionState.anchorRowIndex = Number.isInteger(rowIndex) ? rowIndex : null;
      selectionState.anchorColId = colId || null;
    };

    const toggleSingleCellSelection = (rowNode, colId, forceAdd = false) => {
      if (!rowNode || !colId) return;
      const key = getCellSelectionKey(rowNode, colId);
      if (manualSelectedCells.has(key) && !forceAdd) {
        manualSelectedCells.delete(key);
        return;
      }
      const data = rowNode.data || {};
      manualSelectedCells.set(key, {
        colId,
        headerName: getHeaderFromColId(colId),
        value: data[colId],
      });
    };

    const addRangeSelection = (fromRowIndex, fromColId, toRowIndex, toColId, append = true) => {
      if (!gridApi) return;

      const visibleColIds = getVisibleColIds();
      if (!visibleColIds.length) return;

      const startColIndex = visibleColIds.indexOf(fromColId);
      const endColIndex = visibleColIds.indexOf(toColId);
      if (startColIndex < 0 || endColIndex < 0) return;

      if (!append) {
        manualSelectedCells.clear();
      }

      const rowStart = Math.min(fromRowIndex, toRowIndex);
      const rowEnd = Math.max(fromRowIndex, toRowIndex);
      const colStart = Math.min(startColIndex, endColIndex);
      const colEnd = Math.max(startColIndex, endColIndex);

      for (let rowIndex = rowStart; rowIndex <= rowEnd; rowIndex += 1) {
        const rowNode = typeof gridApi.getDisplayedRowAtIndex === 'function' ? gridApi.getDisplayedRowAtIndex(rowIndex) : null;
        if (!rowNode || !rowNode.data) continue;

        for (let colIndex = colStart; colIndex <= colEnd; colIndex += 1) {
          const colId = visibleColIds[colIndex];
          if (!colId) continue;
          toggleSingleCellSelection(rowNode, colId, true);
        }
      }
    };

    const isCellManuallySelected = (params) => {
      if (!params || !params.node) return false;
      const colId = params.colDef && params.colDef.field ? params.colDef.field : '';
      if (!colId) return false;
      return manualSelectedCells.has(getCellSelectionKey(params.node, colId));
    };

    const refreshManualCellStyles = () => {
      if (gridApi && typeof gridApi.refreshCells === 'function') {
        try { gridApi.refreshCells({ force: true }); } catch {}
      }
    };

    const clearManualCellSelection = () => {
      manualSelectedCells.clear();
      refreshManualCellStyles();
      resetSelectionKpi();
    };

    const renderTable = (rows) => {
      const root = document.getElementById('agGridRoot');
      if (!root) return;
      if (TABLE_COMPACT) root.classList.add('compact-grid'); else root.classList.remove('compact-grid');
      if (TABLE_STRIPED) root.classList.add('striped-grid'); else root.classList.remove('striped-grid');

      const visibleIndexes = HEADERS.map((_, index) => index).filter((index) => tableState.visibleCols[index]);
      const firstVisibleIndex = visibleIndexes.length ? visibleIndexes[0] : -1;
      const rowObjects = rows.map((row) => {
        const obj = {};
        HEADERS.forEach((_, index) => {
          obj['c_' + index] = String(row[index] || '');
        });
        return obj;
      });

      if (!gridApi) {
        if (!(window.agGrid && typeof window.agGrid.createGrid === 'function')) {
          root.innerHTML = '<div style="padding:12px;color:#b8c0e8;font-size:12px;">AG Grid failed to load. Please check internet access.</div>';
          return;
        }

        const columnDefs = HEADERS.map((header, index) => ({
          headerName: header || ('Column ' + (index + 1)),
          field: 'c_' + index,
          hide: !tableState.visibleCols[index],
          sortable: true,
          filter: true,
          resizable: true,
          floatingFilter: true,
          wrapText: AG_GRID_WRAP_TEXT,
          autoHeight: AG_GRID_WRAP_TEXT,
          enableValue: true,
          enableRowGroup: true,
          enablePivot: AG_GRID_ENABLE_PIVOT,
          cellClassRules: {
            'table-cell-selected': (params) => isCellManuallySelected(params),
          },
          pinned: TABLE_FREEZE_FIRST_COL && index === firstVisibleIndex ? 'left' : undefined,
        }));

        gridApi = window.agGrid.createGrid(root, {
          columnDefs,
          rowData: rowObjects,
          defaultColDef: {
            minWidth: 120,
            sortable: true,
            filter: true,
            resizable: true,
            wrapText: AG_GRID_WRAP_TEXT,
            autoHeight: AG_GRID_WRAP_TEXT,
          },
          animateRows: true,
          cellSelection: true,
          enableRangeSelection: true,
          rowSelection: { mode: 'multiRow', checkboxes: false, headerCheckbox: false },
          sideBar: {
            toolPanels: ['columns', 'filters'],
          },
          pivotMode: AG_GRID_ENABLE_PIVOT,
          rowGroupPanelShow: AG_GRID_SHOW_GROUP_PANEL ? 'always' : 'never',
          suppressMovableColumns: AG_GRID_LOCK_COLUMNS,
          statusBar: AG_GRID_SHOW_STATUS_BAR
            ? {
                statusPanels: [
                  { statusPanel: 'agTotalAndFilteredRowCountComponent', align: 'left' },
                  { statusPanel: 'agAggregationComponent', align: 'right' },
                ],
              }
            : undefined,
          onCellClicked: (params) => {
            const colId = params && params.colDef && params.colDef.field ? params.colDef.field : '';
            if (!colId || !params.node) return;

            const nativeEvent = params.event;
            const isModifier = !!(nativeEvent && (nativeEvent.ctrlKey || nativeEvent.metaKey));
            const isShift = !!(nativeEvent && nativeEvent.shiftKey);

            if (isShift && Number.isInteger(selectionState.anchorRowIndex) && selectionState.anchorColId) {
              addRangeSelection(selectionState.anchorRowIndex, selectionState.anchorColId, params.node.rowIndex, colId, true);
            } else {
              if (isModifier) {
                toggleSingleCellSelection(params.node, colId, false);
              } else {
                toggleSingleCellSelection(params.node, colId, true);
              }
              setSelectionAnchor(params.node.rowIndex, colId);
            }

            refreshManualCellStyles();
            updateSelectionKpiFromSelectedCells();
          },
          onCellKeyDown: (params) => {
            const event = params && params.event;
            if (!event) return;

            const colId = params && params.colDef && params.colDef.field ? params.colDef.field : '';
            const rowIndex = params && params.node && Number.isInteger(params.node.rowIndex) ? params.node.rowIndex : null;
            if (!colId || rowIndex === null) return;

            const key = String(event.key || '');
            const isToggleKey = key === ' ' || key === 'Enter';
            const isArrowKey = key === 'ArrowUp' || key === 'ArrowDown' || key === 'ArrowLeft' || key === 'ArrowRight';

            if (isToggleKey) {
              event.preventDefault();
              toggleSingleCellSelection(params.node, colId, event.shiftKey ? true : false);
              setSelectionAnchor(rowIndex, colId);
              refreshManualCellStyles();
              updateSelectionKpiFromSelectedCells();
              return;
            }

            if (isArrowKey && event.shiftKey) {
              if (!Number.isInteger(selectionState.anchorRowIndex) || !selectionState.anchorColId) {
                setSelectionAnchor(rowIndex, colId);
              }
              selectionState.pendingShiftRangeFromKeyboard = true;
              window.setTimeout(() => {
                if (!gridApi || !selectionState.pendingShiftRangeFromKeyboard) return;
                selectionState.pendingShiftRangeFromKeyboard = false;
                const focused = typeof gridApi.getFocusedCell === 'function' ? gridApi.getFocusedCell() : null;
                if (!focused || !Number.isInteger(focused.rowIndex) || !focused.column || typeof focused.column.getColId !== 'function') return;
                const focusedColId = focused.column.getColId();
                addRangeSelection(selectionState.anchorRowIndex, selectionState.anchorColId, focused.rowIndex, focusedColId, true);
                refreshManualCellStyles();
                updateSelectionKpiFromSelectedCells();
              }, 0);
            }
          },
          onRangeSelectionChanged: () => updateSelectionKpiFromSelectedCells(),
          onCellSelectionChanged: () => updateSelectionKpiFromSelectedCells(),
          pagination: true,
          paginationPageSize: tableState.pageSize,
          suppressCellFocus: false,
        });

        applyGridSizing();
      } else {
        const colDefs = HEADERS.map((header, index) => ({
          headerName: header || ('Column ' + (index + 1)),
          field: 'c_' + index,
          hide: !tableState.visibleCols[index],
          sortable: true,
          filter: true,
          resizable: true,
          floatingFilter: true,
          wrapText: AG_GRID_WRAP_TEXT,
          autoHeight: AG_GRID_WRAP_TEXT,
          enableValue: true,
          enableRowGroup: true,
          enablePivot: AG_GRID_ENABLE_PIVOT,
          cellClassRules: {
            'table-cell-selected': (params) => isCellManuallySelected(params),
          },
          pinned: TABLE_FREEZE_FIRST_COL && index === firstVisibleIndex ? 'left' : undefined,
        }));
        gridApi.setGridOption('columnDefs', colDefs);
        gridApi.setGridOption('rowData', rowObjects);
        gridApi.paginationSetPageSize(tableState.pageSize);
        gridApi.setGridOption('pivotMode', AG_GRID_ENABLE_PIVOT);
        gridApi.setGridOption('rowGroupPanelShow', AG_GRID_SHOW_GROUP_PANEL ? 'always' : 'never');
        gridApi.setGridOption('suppressMovableColumns', AG_GRID_LOCK_COLUMNS);
        gridApi.setGridOption('statusBar', AG_GRID_SHOW_STATUS_BAR
          ? {
              statusPanels: [
                { statusPanel: 'agTotalAndFilteredRowCountComponent', align: 'left' },
                { statusPanel: 'agAggregationComponent', align: 'right' },
              ],
            }
          : undefined);
        applyGridSizing();
      }

      if (gridApi) {
        if (typeof gridApi.setGridOption === 'function') {
          gridApi.setGridOption('quickFilterText', tableState.quickFilter);
        } else if (typeof gridApi.setQuickFilter === 'function') {
          gridApi.setQuickFilter(tableState.quickFilter);
        }
      }

      const displayedRows = gridApi && typeof gridApi.getDisplayedRowCount === 'function'
        ? gridApi.getDisplayedRowCount()
        : rows.length;
      const summary = document.getElementById('tableSummary');
      if (summary) summary.textContent = displayedRows + ' rows visible • ' + rows.length + ' rows total';
    };

    const resetSelectionKpi = () => {
      const labelEl = document.getElementById('kpi-selection-label');
      const valueEl = document.getElementById('kpi-selection-value');
      if (!labelEl || !valueEl) return;
      labelEl.textContent = 'Selected total';
      valueEl.textContent = '—';
    };

    const updateSelectionKpiFromSelectedCells = () => {
      const labelEl = document.getElementById('kpi-selection-label');
      const valueEl = document.getElementById('kpi-selection-value');
      if (!labelEl || !valueEl) {
        return;
      }

      if (manualSelectedCells.size > 0) {
        const byColumn = new Map();
        manualSelectedCells.forEach((entry) => {
          const colId = entry.colId || '';
          if (!colId) return;
          const header = entry.headerName || colId;
          const numeric = parseNumeric(entry.value);
          const bucket = byColumn.get(colId) || { header, sum: 0, count: 0, numericCount: 0 };
          bucket.count += 1;
          if (numeric !== null) {
            bucket.numericCount += 1;
            bucket.sum += numeric;
          }
          byColumn.set(colId, bucket);
        });

        if (byColumn.size !== 1) {
          labelEl.textContent = 'Selected total';
          valueEl.textContent = 'Select one column';
          return;
        }

        const onlyColumn = Array.from(byColumn.values())[0];
        labelEl.textContent = 'Selected total (' + onlyColumn.header + ')';
        if (onlyColumn.numericCount > 0) {
          valueEl.textContent = formatMetric(onlyColumn.sum);
        } else {
          valueEl.textContent = String(onlyColumn.count) + ' cells';
        }
        return;
      }

      if (!gridApi || typeof gridApi.getCellRanges !== 'function') {
        resetSelectionKpi();
        return;
      }

      const ranges = gridApi.getCellRanges() || [];
      if (!ranges.length) {
        resetSelectionKpi();
        return;
      }

      const uniqueCells = new Set();
      const byColumn = new Map();

      ranges.forEach((range) => {
        const columns = Array.isArray(range.columns) ? range.columns : [];
        const startRowIndex = range.startRow && Number.isInteger(range.startRow.rowIndex) ? range.startRow.rowIndex : null;
        const endRowIndex = range.endRow && Number.isInteger(range.endRow.rowIndex) ? range.endRow.rowIndex : null;
        if (startRowIndex === null || endRowIndex === null || !columns.length) return;

        const from = Math.min(startRowIndex, endRowIndex);
        const to = Math.max(startRowIndex, endRowIndex);

        for (let rowIndex = from; rowIndex <= to; rowIndex += 1) {
          const rowNode = typeof gridApi.getDisplayedRowAtIndex === 'function' ? gridApi.getDisplayedRowAtIndex(rowIndex) : null;
          if (!rowNode || !rowNode.data) continue;

          columns.forEach((column) => {
            const colId = column && typeof column.getColId === 'function' ? column.getColId() : '';
            if (!colId) return;

            const uniqueKey = String(rowIndex) + ':' + colId;
            if (uniqueCells.has(uniqueKey)) return;
            uniqueCells.add(uniqueKey);

            const headerName = column && typeof column.getColDef === 'function'
              ? String(column.getColDef().headerName || colId)
              : colId;

            const bucket = byColumn.get(colId) || { header: headerName, sum: 0, count: 0, numericCount: 0 };
            const rawValue = rowNode.data[colId];
            const numeric = parseNumeric(rawValue);

            bucket.count += 1;
            if (numeric !== null) {
              bucket.numericCount += 1;
              bucket.sum += numeric;
            }

            byColumn.set(colId, bucket);
          });
        }
      });

      if (byColumn.size !== 1) {
        labelEl.textContent = 'Selected total';
        valueEl.textContent = 'Select one column';
        return;
      }

      const onlyColumn = Array.from(byColumn.values())[0];
      if (onlyColumn.count < 1) {
        resetSelectionKpi();
        return;
      }

      labelEl.textContent = 'Selected total (' + onlyColumn.header + ')';
      if (onlyColumn.numericCount > 0) {
        valueEl.textContent = formatMetric(onlyColumn.sum);
      } else {
        valueEl.textContent = String(onlyColumn.count) + ' cells';
      }
    };

    const applyGridSizing = () => {
      if (!gridApi) return;
      if (AG_GRID_AUTO_SIZE_COLUMNS && typeof gridApi.autoSizeAllColumns === 'function') {
        try {
          gridApi.autoSizeAllColumns(false);
          return;
        } catch {
        }
      }
      if (AG_GRID_FIT_COLUMNS && typeof gridApi.sizeColumnsToFit === 'function') {
        try {
          gridApi.sizeColumnsToFit();
        } catch {
        }
      }
    };

    const renderChart = (rows) => {
      const root = document.getElementById('chartRoot');
      if (!root) return;

      if (METRIC_COL < 0) {
        root.innerHTML = '<div style="font-size:13px;color:#b8c0e8;">No numeric column detected for charting. Add a numeric metric column.</div>';
        return;
      }

      const data = rows
        .map((row, index) => ({
          label: String(row[LABEL_COL] || ('Item ' + (index + 1))).slice(0, 16),
          value: parseNumeric(row[METRIC_COL] || ''),
        }))
        .filter((item) => item.value !== null)
        .slice(0, 10);

      if (!data.length) {
        root.innerHTML = '<div style="font-size:13px;color:#b8c0e8;">No chart data after applying filters.</div>';
        return;
      }

      const maxValue = Math.max(...data.map((d) => d.value), 1);
      const colors = ['#58a4ff', '#7c7cff', '#59d7b7', '#ffc867', '#ff8a7a', '#86d3ff', '#c9a8ff', '#9ad18f', '#f8a5c2', '#f6d365'];

      if (CHART_TYPE === 'line') {
        const width = 640;
        const height = 220;
        const left = 34;
        const right = 16;
        const top = 18;
        const bottom = 28;
        const plotW = width - left - right;
        const plotH = height - top - bottom;
        const points = data.map((item, index) => {
          const x = left + (index * (plotW / Math.max(1, data.length - 1)));
          const y = top + (plotH - (item.value / maxValue) * plotH);
          return String(x) + ',' + String(y);
        }).join(' ');
        const labels = data.map((item, index) => {
          const x = left + (index * (plotW / Math.max(1, data.length - 1)));
          return '<text x="' + x + '" y="' + (height - 8) + '" text-anchor="middle" font-size="10" fill="#b8c0e8">' + escapeHtml(item.label) + '</text>';
        }).join('');
        root.innerHTML = '<div class="line-wrap"><svg class="line-svg" viewBox="0 0 ' + width + ' ' + height + '" preserveAspectRatio="none"><line x1="' + left + '" y1="' + (height - bottom) + '" x2="' + (width - right) + '" y2="' + (height - bottom) + '" stroke="#32406f" /><line x1="' + left + '" y1="' + top + '" x2="' + left + '" y2="' + (height - bottom) + '" stroke="#32406f" /><polyline fill="none" stroke="#58a4ff" stroke-width="2.5" points="' + points + '" />' + labels + '</svg></div>';
        return;
      }

      if (CHART_TYPE === 'pie') {
        const sum = data.reduce((acc, item) => acc + item.value, 0) || 1;
        let angle = 0;
        const stops = data.map((item, idx) => {
          const start = angle;
          angle += (item.value / sum) * 360;
          return colors[idx % colors.length] + ' ' + start + 'deg ' + angle + 'deg';
        }).join(', ');

        const legend = data.map((item, idx) => '<div class="legend-item"><span class="legend-color" style="background:' + colors[idx % colors.length] + '"></span><span>' + escapeHtml(item.label) + ' (' + item.value + ')</span></div>').join('');
        root.innerHTML = '<div class="pie-wrap"><div class="pie-chart" style="background:conic-gradient(' + stops + ')"></div><div class="pie-legend">' + legend + '</div></div>';
        return;
      }

      root.innerHTML = data.map((entry) => {
        const pct = Math.max(2, Math.round((entry.value / maxValue) * 100));
        return '<div class="bar-row"><span class="bar-label">' + escapeHtml(entry.label) + '</span><div class="bar-track"><div class="bar-fill" style="width:' + pct + '%"></div></div><span class="bar-value">' + entry.value + '</span></div>';
      }).join('');
    };

    const formatMetric = (value) => {
      if (value === null || value === undefined || Number.isNaN(value)) return 'N/A';
      const abs = Math.abs(value);
      if (abs >= 1e9) return (value / 1e9).toFixed(2) + 'B';
      if (abs >= 1e6) return (value / 1e6).toFixed(2) + 'M';
      if (abs >= 1e3) return (value / 1e3).toFixed(2) + 'K';
      return Number(value).toFixed(2);
    };

    const computeMedian = (values) => {
      if (!values.length) return null;
      const sorted = values.slice().sort((a, b) => a - b);
      const mid = Math.floor(sorted.length / 2);
      if (sorted.length % 2 === 0) {
        return (sorted[mid - 1] + sorted[mid]) / 2;
      }
      return sorted[mid];
    };

    const computeVariance = (values) => {
      if (!values.length) return null;
      const avg = values.reduce((sum, value) => sum + value, 0) / values.length;
      return values.reduce((sum, value) => sum + Math.pow(value - avg, 2), 0) / values.length;
    };

    const renderKpis = (rows) => {
      const rowsEl = document.getElementById('kpi-rows');
      const columnsEl = document.getElementById('kpi-columns');
      const sourcesEl = document.getElementById('kpi-sources');
      const primaryEl = document.getElementById('kpi-primary-value');
      const secondaryEl = document.getElementById('kpi-secondary-value');
      if (!rowsEl || !columnsEl || !sourcesEl || !primaryEl || !secondaryEl) return;

      rowsEl.textContent = String(rows.length);
      columnsEl.textContent = String(HEADERS.length);
      sourcesEl.textContent = String(${sourceCount});

      const values = METRIC_COL >= 0
        ? rows.map((row) => parseNumeric(row[METRIC_COL] || '')).filter((value) => value !== null)
        : [];

      let primaryValue = null;
      if (PRIMARY_KPI_MODE === 'sum') {
        primaryValue = values.length ? values.reduce((sum, value) => sum + value, 0) : null;
      } else if (PRIMARY_KPI_MODE === 'median') {
        primaryValue = computeMedian(values);
      } else if (PRIMARY_KPI_MODE === 'count') {
        primaryValue = rows.length;
      } else {
        primaryValue = values.length ? (values.reduce((sum, value) => sum + value, 0) / values.length) : null;
      }

      let secondaryValue = null;
      if (SECONDARY_KPI_MODE === 'group-count' && GROUP_BY_COL >= 0) {
        secondaryValue = new Set(rows.map((row) => String(row[GROUP_BY_COL] || '').trim()).filter(Boolean)).size;
      } else if (SECONDARY_KPI_MODE === 'variance') {
        secondaryValue = computeVariance(values);
      } else if (SECONDARY_KPI_MODE === 'range') {
        secondaryValue = values.length ? (Math.max(...values) - Math.min(...values)) : null;
      } else if (SECONDARY_KPI_MODE === 'distinct' && LABEL_COL >= 0) {
        secondaryValue = new Set(rows.map((row) => String(row[LABEL_COL] || '').trim()).filter(Boolean)).size;
      } else {
        secondaryValue = computeMedian(values);
      }

      primaryEl.textContent = PRIMARY_KPI_MODE === 'count' ? String(primaryValue ?? '0') : formatMetric(primaryValue);
      secondaryEl.textContent = (SECONDARY_KPI_MODE === 'group-count' || SECONDARY_KPI_MODE === 'distinct')
        ? String(secondaryValue ?? 0)
        : formatMetric(secondaryValue);
    };

    function renderAll() {
      const filtered = getFilteredRows();
      const transformed = applyDataTransforms(filtered);
      const searched = applyQuickFilter(transformed);
      renderKpis(searched);
      renderChart(searched);
      renderTable(searched);
      if (manualSelectedCells.size > 0) {
        clearManualCellSelection();
      }
      updateSelectionKpiFromSelectedCells();
    }

    const quickFilterInput = document.getElementById('tableQuickFilter');
    if (quickFilterInput) {
      quickFilterInput.value = tableState.quickFilter;
      quickFilterInput.addEventListener('input', (event) => {
        const target = event.target;
        if (!(target instanceof HTMLInputElement)) return;
        tableState.quickFilter = target.value || '';
        renderAll();
      });
    }

    const pageSizeSelect = document.getElementById('tablePageSize');
    if (pageSizeSelect) {
      pageSizeSelect.value = String(tableState.pageSize);
      pageSizeSelect.addEventListener('change', (event) => {
        const target = event.target;
        if (!(target instanceof HTMLSelectElement)) return;
        const next = Number(target.value);
        tableState.pageSize = Number.isFinite(next) ? Math.max(10, Math.min(200, next)) : 25;
        renderAll();
      });
    }

    const clearSelectionBtn = document.getElementById('clearSelectionBtn');
    if (clearSelectionBtn) {
      clearSelectionBtn.addEventListener('click', () => {
        clearManualCellSelection();
        updateSelectionKpiFromSelectedCells();
      });
    }

    const tableFullscreenToggle = document.getElementById('tableFullscreenToggle');
    const syncTableFullscreenState = () => {
      if (!tableFullscreenToggle) return;
      const isFullscreen = document.body.classList.contains('table-fullscreen');
      tableFullscreenToggle.textContent = isFullscreen ? 'Exit Fullscreen' : 'Fullscreen Table';
      tableFullscreenToggle.setAttribute('aria-pressed', isFullscreen ? 'true' : 'false');
    };

    if (tableFullscreenToggle) {
      tableFullscreenToggle.addEventListener('click', () => {
        document.body.classList.toggle('table-fullscreen');
        syncTableFullscreenState();
        if (gridApi && typeof gridApi.sizeColumnsToFit === 'function') {
          window.setTimeout(() => {
            try { applyGridSizing(); } catch {}
          }, 80);
        }
      });
    }

    window.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && document.body.classList.contains('table-fullscreen')) {
        document.body.classList.remove('table-fullscreen');
        syncTableFullscreenState();
      }
    });

    syncTableFullscreenState();

    renderFilters();
    renderAll();
  </script>
</body>
</html>`;

    const htmlBuffer = Buffer.from(html, 'utf-8');
    const dashboardSummary = await dashboardSummaryPromise;
    return {
      success: true,
      data: {
        htmlBase64: htmlBuffer.toString('base64'),
        title: dashboardTitle,
        summary: dashboardSummary,
      },
      type: 'dashboard',
      processingTime: Date.now() - startTime,
      provider: 'native-dashboard',
    };
  } catch (error: any) {
    return {
      success: false,
      error: `Dashboard generation failed: ${error.message}`,
      type: 'dashboard',
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
      return performOCR(imageBuffer, {
        ...(request.options || {}),
        mimeType: request.mimeType,
        fileName: request.fileName,
      });

    case 'document':
      if (!request.prompt) {
        return {
          success: false,
          error: 'Content is required for document generation',
          type: 'document',
          processingTime: 0,
        };
      }
      const format = (request.options?.format || 'pdf') as 'pdf' | 'docx' | 'xlsx' | 'markdown';
      return generateDocument(request.prompt, format, request.options);

    case 'dashboard':
      return generateDashboard(request.prompt || 'Generated dashboard', request.attachments, request.options);

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
  generateDashboard,
  processAIToolRequest,
};

export default aiToolsService;
