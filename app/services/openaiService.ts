import { SearchMode, Settings, VoiceName, Language } from '../types';

const API_BASE = '/api/chronoread';

export type TtsAudioPayload = {
  audio: string;
  mimeType: string;
};

export async function generateNarrative(
  query: string,
  mode: SearchMode,
  settings: Settings,
  chatHistory: Array<{ role: string; content: string }>,
  interactionMode: "read" | "listen" = "read",
  userContext?: {
    profile?: {
      name?: string;
      age?: number | null;
      location?: string;
      interests?: string;
      pulse?: string;
      bio?: string;
    };
    recentQueries?: string[];
    attachments?: Array<{
      id: string;
      name: string;
      size: number;
      type: string;
      base64?: string;
      tool: string;
    }>;
  },
  continuation?: {
    previousNarration?: string;
    userInterruption?: string;
  },
  selectedModel?: string
): Promise<{ narration: string; languageUsed?: string; modelUsed?: string; failedModels?: string[]; referencesHtml?: string; tokenUsage?: { promptTokens: number; completionTokens: number; totalTokens: number; estimatedCost?: number } }> {
  try {
    const category = mode === SearchMode.BOOK ? 'Book' : mode === SearchMode.CASE_STUDY ? 'Case Study' : 'Ask';
    const res = await fetch(`${API_BASE}/ai`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        query, 
        category,
        narrationTime: 2.5, // Default 2.5 minutes
        narrationType: settings.narrationType,
        language: settings.language,
        aiModel: settings.aiModel,
        enableWebSearch: settings.enableWebSearch ?? true,
        interactionMode,
        chatHistory,
        userContext,
        continuation,
        selectedModel,
      }),
    });

    if (!res.ok) {
      const payload = await res.json().catch(() => ({}));
      console.error('AI proxy error:', payload);
      const errorMessage = typeof payload?.error === 'string' && payload.error.trim()
        ? payload.error.trim()
        : 'Sorry — AI is unavailable right now.';
      return {
        narration: errorMessage,
        failedModels: Array.isArray(payload?.failedModels) ? payload.failedModels : [],
      };
    }

    const data = await res.json();
    return { 
      narration: data.narration || '', 
      languageUsed: data.languageUsed,
      modelUsed: data.modelUsed,
      failedModels: Array.isArray(data.failedModels) ? data.failedModels : [],
      referencesHtml: data.referencesHtml,
      tokenUsage: data.tokenUsage,
    };
  } catch (error) {
    console.error('Error generating narrative (proxy):', error);
    return { narration: 'Sorry — AI is unavailable right now.' };
  }
}

export async function generateSpeechDetailed(text: string, voiceType: string, language?: string): Promise<TtsAudioPayload> {
  try {
    // Enhanced voice mapping for better native speaker experience
    const getOpenAIVoice = (voiceType: string, language?: string): string => {
      // Base mapping
      const baseMap: Record<VoiceName, string> = {
        [VoiceName.ZEPHYR]: 'alloy',  // Clear, professional
        [VoiceName.KORE]: 'nova',    // Warm, engaging
        [VoiceName.PUCK]: 'fable',   // Dynamic, youthful
        [VoiceName.CHARON]: 'onyx',  // Deep, authoritative
        [VoiceName.FENRIR]: 'echo',  // Warm, natural
      };

      const isLegacyVoice = Object.values(VoiceName).includes(voiceType as VoiceName);
      const resolvedVoice = isLegacyVoice ? (voiceType as VoiceName) : VoiceName.ZEPHYR;

      let voice = baseMap[resolvedVoice] || 'alloy';

      // Language-specific optimizations for native speaker experience
      if (language) {
        const lang = language.toLowerCase();
        if (lang.includes('hindi') || lang.includes('sanskrit')) {
          voice = resolvedVoice === VoiceName.KORE ? 'nova' : 'alloy'; // Warm voices for Indian languages
        } else if (lang.includes('spanish') || lang.includes('portuguese')) {
          voice = 'nova'; // Natural for Romance languages
        } else if (lang.includes('french') || lang.includes('german')) {
          voice = 'alloy'; // Clear for European languages
        } else if (lang.includes('chinese') || lang.includes('japanese') || lang.includes('korean')) {
          voice = 'echo'; // Natural for East Asian languages
        } else if (lang.includes('arabic') || lang.includes('hebrew')) {
          voice = 'onyx'; // Authoritative for Middle Eastern languages
        }
      }

      return voice;
    };

    const primaryVoice = getOpenAIVoice(voiceType, language);
    const res = await fetch(`${API_BASE}/tts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, voice: primaryVoice }),
    });

    if (!res.ok) {
      if (primaryVoice !== 'alloy') {
        const retry = await fetch(`${API_BASE}/tts`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text, voice: 'alloy' }),
        });

        if (retry.ok) {
          const data = await retry.json();
          return {
            audio: data.audio || '',
            mimeType: data.mimeType || 'audio/mpeg',
          };
        }
      }

      const payload = await res.json().catch(() => ({}));
      console.error('TTS proxy error:', payload);
      return { audio: '', mimeType: 'audio/mpeg' };
    }

    const data = await res.json();
    return {
      audio: data.audio || '',
      mimeType: data.mimeType || 'audio/mpeg',
    };
  } catch (error) {
    console.error('Error generating speech (proxy):', error);
    return { audio: '', mimeType: 'audio/mpeg' };
  }
}

export async function generateSpeech(text: string, voiceType: string, language?: string): Promise<string> {
  const result = await generateSpeechDetailed(text, voiceType, language);
  return result.audio;
}

export async function generateSuggestions(
  query: string,
  language: Language,
  chatHistory: Array<{ role: string; content: string }>
): Promise<string[]> {
  try {
    const res = await fetch(`${API_BASE}/suggestions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, language, chatHistory }),
    });

    if (!res.ok) {
      const payload = await res.json().catch(() => ({}));
      console.error('Suggestions proxy error:', payload);
      return [];
    }

    const data = await res.json();
    return Array.isArray(data.suggestions) ? data.suggestions : [];
  } catch (error) {
    console.error('Error generating suggestions (proxy):', error);
    return [];
  }
}

export async function generateDashboardSuggestions(
  query: string,
  chatHistory: Array<{ role: string; content: string }>,
  headers: string[] = []
): Promise<string[]> {
  try {
    const res = await fetch(`${API_BASE}/suggestions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query,
        language: Language.ENGLISH,
        chatHistory,
        tool: 'dashboard',
        headers,
      }),
    });

    if (!res.ok) {
      const payload = await res.json().catch(() => ({}));
      console.error('Dashboard suggestions proxy error:', payload);
      return [];
    }

    const data = await res.json();
    return Array.isArray(data.suggestions)
      ? data.suggestions
          .map((item: unknown) => String(item || '').trim())
          .filter(Boolean)
          .slice(0, 6)
      : [];
  } catch (error) {
    console.error('Error generating dashboard suggestions (proxy):', error);
    return [];
  }
}

export async function generateToolImage(
  prompt: string,
  model: string = 'auto',
  sourceImageUrl?: string,
  imageConfig?: {
    size?: string;
    quality?: string;
    style?: string;
  }
): Promise<{ imageUrl?: string; modelUsed?: string; error?: string }> {
  try {
    const res = await fetch(`${API_BASE}/ai-tools`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'image',
        prompt,
        options: {
          model,
          n: 1,
          size: imageConfig?.size || '1024x1024',
          quality: imageConfig?.quality || 'standard',
          style: imageConfig?.style || 'natural',
          ...(sourceImageUrl ? { sourceImageUrl } : {}),
        },
      }),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data?.success) {
      return { error: data?.error || 'Image generation failed' };
    }

    const imageUrl = data?.data?.images?.[0]?.url as string | undefined;
    const modelUsed = data?.data?.model as string | undefined;

    if (!imageUrl) {
      return { error: 'No image URL returned from provider' };
    }

    return { imageUrl, modelUsed };
  } catch (error) {
    console.error('Error generating tool image:', error);
    return { error: 'Image generation service is unavailable right now.' };
  }
}

export async function generateToolVideo(
  prompt: string,
  model: string = 'auto',
  videoConfig?: {
    duration?: number;
    resolution?: string;
    aspectRatio?: string;
  }
): Promise<{ videoUrl?: string; modelUsed?: string; status?: string; error?: string; operationId?: string; videoId?: string; provider?: string }> {
  try {
    const res = await fetch(`${API_BASE}/ai-tools`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'video',
        prompt,
        options: {
          model,
          duration: videoConfig?.duration || 5,
          resolution: videoConfig?.resolution || '1080p',
          aspectRatio: videoConfig?.aspectRatio || '16:9',
        },
      }),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data?.success) {
      return { error: data?.error || 'Video generation failed' };
    }

    const result = {
      videoUrl: data?.data?.videoUrl as string | undefined,
      modelUsed: data?.data?.model as string | undefined,
      status: data?.data?.status as string | undefined,
      operationId: data?.data?.operationId as string | undefined,
      videoId: data?.data?.videoId as string | undefined,
      provider: data?.provider as string | undefined,
    };

    console.log('[generateToolVideo] Initial response:', JSON.stringify(result).substring(0, 200));
    return result;
  } catch (error) {
    console.error('Error generating tool video:', error);
    return { error: 'Video generation service is unavailable right now.' };
  }
}

export async function pollToolVideoStatus(
  options: {
    model?: string;
    provider?: string;
    operationId?: string;
    videoId?: string;
  }
): Promise<{ videoUrl?: string; modelUsed?: string; status?: string; error?: string; operationId?: string; videoId?: string; provider?: string }> {
  try {
    console.log('[pollToolVideoStatus] Polling with:', JSON.stringify(options).substring(0, 200));

    const res = await fetch(`${API_BASE}/ai-tools`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'video',
        prompt: 'status-check',
        options: {
          model: options.model || 'auto',
          provider: options.provider,
          operationId: options.operationId,
          videoId: options.videoId,
        },
      }),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data?.success) {
      console.log('[pollToolVideoStatus] Poll failed:', data?.error);
      return { error: data?.error || 'Video status check failed' };
    }

    const result = {
      videoUrl: data?.data?.videoUrl as string | undefined,
      modelUsed: data?.data?.model as string | undefined,
      status: data?.data?.status as string | undefined,
      operationId: data?.data?.operationId as string | undefined,
      videoId: data?.data?.videoId as string | undefined,
      provider: data?.provider as string | undefined,
    };

    console.log('[pollToolVideoStatus] Poll result:', JSON.stringify(result).substring(0, 200));
    return result;
  } catch (error) {
    console.error('Error polling tool video status:', error);
    return { error: 'Video status service is unavailable right now.' };
  }
}

export async function generateToolDocument(
  prompt: string,
  model: string = 'auto',
  attachments?: Array<{ id: string; name: string; size: number; type: string; base64?: string; tool: string }>,
  options?: {
    format?: 'pdf' | 'docx' | 'xlsx' | 'markdown';
    title?: string;
    style?: 'minimal' | 'professional' | 'creative';
    targetFileSizeKB?: number;
    fileName?: string;
  }
): Promise<{ fileBase64?: string; format?: string; mimeType?: string; fileName?: string; summary?: string; error?: string }> {
  try {
    const res = await fetch(`${API_BASE}/ai-tools`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'document',
        prompt,
        attachments: (attachments || []).map((attachment) => ({
          type: attachment.type,
          data: attachment.base64 || '',
          name: attachment.name,
        })),
        options: {
          model,
          format: options?.format || 'pdf',
          title: options?.title,
          style: options?.style || 'professional',
          targetFileSizeKB: options?.targetFileSizeKB,
          fileName: options?.fileName,
        },
      }),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data?.success) {
      return { error: data?.error || 'Document generation failed' };
    }

    return {
      fileBase64: data?.data?.buffer as string | undefined,
      format: data?.data?.format as string | undefined,
      mimeType: data?.data?.mimeType as string | undefined,
      fileName: data?.data?.fileName as string | undefined,
      summary: data?.data?.summary as string | undefined,
    };
  } catch (error) {
    console.error('Error generating tool document:', error);
    return { error: 'Document generation service is unavailable right now.' };
  }
}

export async function generateToolDashboard(
  prompt: string,
  attachments?: Array<{ id: string; name: string; size: number; type: string; base64?: string; tool: string }>,
  options?: { title?: string }
): Promise<{ htmlBase64?: string; title?: string; summary?: string; error?: string }> {
  try {
    const res = await fetch(`${API_BASE}/ai-tools`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'dashboard',
        prompt,
        attachments: (attachments || []).map((attachment) => ({
          type: attachment.type,
          data: attachment.base64 || '',
          name: attachment.name,
        })),
        options,
      }),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data?.success) {
      return { error: data?.error || 'Dashboard generation failed' };
    }

    return {
      htmlBase64: data?.data?.htmlBase64 as string | undefined,
      title: data?.data?.title as string | undefined,
      summary: data?.data?.summary as string | undefined,
    };
  } catch (error) {
    console.error('Error generating dashboard:', error);
    return { error: 'Dashboard generation service is unavailable right now.' };
  }
}

export async function generateToolOCR(
  fileBase64: string,
  fileName: string,
  model: string = 'auto',
  options?: { language?: string; mimeType?: string }
): Promise<{ fullText?: string; details?: unknown[]; provider?: string; error?: string }> {
  try {
    const res = await fetch(`${API_BASE}/ai-tools`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'ocr',
        file: fileBase64,
        fileName,
        mimeType: options?.mimeType,
        options: {
          model,
          language: options?.language,
        },
      }),
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data?.success) {
      return { error: data?.error || 'OCR failed' };
    }

    return {
      fullText: data?.data?.fullText as string | undefined,
      details: data?.data?.details as unknown[] | undefined,
      provider: data?.provider as string | undefined,
    };
  } catch (error) {
    console.error('Error generating OCR output:', error);
    return { error: 'OCR service is unavailable right now.' };
  }
}

export function decodeAudio(base64: string): Uint8Array {
  const cleanedBase64 = (base64 || '')
    .trim()
    .replace(/^data:[^;]+;base64,/i, '')
    .replace(/\s+/g, '');
  const binaryString = atob(cleanedBase64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

export async function getAudioBuffer(
  data: Uint8Array,
  audioContext: AudioContext
): Promise<AudioBuffer> {
  // Create a fresh copy to avoid detached-buffer issues with typed array views
  const arrayBuffer = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer;
  return audioContext.decodeAudioData(arrayBuffer);
}

/**
 * Transcribe audio to text using OpenAI Whisper API
 * @param audioBlob - Audio blob to transcribe
 * @param language - Optional language code (BCP-47 format)
 * @returns Transcribed text
 */
export async function transcribeAudio(
  audioBlob: Blob,
  language?: Language
): Promise<string> {
  try {
    const formData = new FormData();
    formData.append('file', audioBlob, 'audio.webm');
    if (language) {
      const langCode = getLanguageCode(language);
      formData.append('language', langCode);
    }

    const res = await fetch(`${API_BASE}/stt`, {
      method: 'POST',
      body: formData,
    });

    if (!res.ok) {
      const payload = await res.json().catch(() => ({}));
      console.error('STT proxy error:', payload);
      return '';
    }

    const data = await res.json();
    return data.text || '';
  } catch (error) {
    console.error('Error transcribing audio:', error);
    return '';
  }
}

/**
 * Convert Language enum to BCP-47 language code for Whisper API
 */
function getLanguageCode(language: Language): string {
  const langMap: Record<Language, string> = {
    [Language.ENGLISH]: 'en',
    [Language.SPANISH]: 'es',
    [Language.FRENCH]: 'fr',
    [Language.GERMAN]: 'de',
    [Language.CHINESE]: 'zh',
    [Language.JAPANESE]: 'ja',
    [Language.HINDI]: 'hi',
    [Language.PORTUGUESE]: 'pt',
    [Language.TAMIL]: 'ta',
    [Language.TELUGU]: 'te',
    [Language.MALAYALAM]: 'ml',
    [Language.KANNADA]: 'kn',
    [Language.BENGALI]: 'bn',
    [Language.MARATHI]: 'mr',
    [Language.GUJARATI]: 'gu',
    [Language.PUNJABI]: 'pa',
  };
  return langMap[language] || 'en';
}
