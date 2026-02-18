import { SearchMode, Settings, VoiceName, Language } from '../types';

const API_BASE = '/api/chronoread';

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
  },
  continuation?: {
    previousNarration?: string;
    userInterruption?: string;
  }
): Promise<{ narration: string; modelUsed?: string; referencesHtml?: string }> {
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
      }),
    });

    if (!res.ok) {
      const payload = await res.json().catch(() => ({}));
      console.error('AI proxy error:', payload);
      return { narration: 'Sorry — AI is unavailable right now.' };
    }

    const data = await res.json();
    return { 
      narration: data.narration || '', 
      modelUsed: data.modelUsed,
      referencesHtml: data.referencesHtml,
    };
  } catch (error) {
    console.error('Error generating narrative (proxy):', error);
    return { narration: 'Sorry — AI is unavailable right now.' };
  }
}

export async function generateSpeech(text: string, voiceType: string, language?: string): Promise<string> {
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
          return data.audio || '';
        }
      }

      const payload = await res.json().catch(() => ({}));
      console.error('TTS proxy error:', payload);
      return '';
    }

    const data = await res.json();
    return data.audio || '';
  } catch (error) {
    console.error('Error generating speech (proxy):', error);
    return '';
  }
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

export function decodeAudio(base64: string): Uint8Array {
  const binaryString = atob(base64);
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
  const arrayBuffer = data.buffer as ArrayBuffer;
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
