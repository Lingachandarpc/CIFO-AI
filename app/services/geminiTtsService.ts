/**
 * Gemini TTS Service
 * Uses Google's Gemini 2.5 Flash TTS model for text-to-speech generation.
 * Supports the same voice names as the VoiceName enum (Zephyr, Kore, Puck, Charon, Fenrir).
 * Supports all 16 languages natively — the voice adapts to the input language.
 *
 * Voice → Gender mapping:
 *   Zephyr  → female
 *   Kore    → female
 *   Puck    → male
 *   Charon  → male
 *   Fenrir  → male
 */

import { Language, VoiceName, VoiceGender } from '../types';

// ============================================================================
// Voice ↔ Gender metadata
// ============================================================================

const VOICE_GENDER_MAP: Record<string, VoiceGender> = {
  Zephyr: VoiceGender.FEMALE,
  Kore: VoiceGender.FEMALE,
  Puck: VoiceGender.MALE,
  Charon: VoiceGender.MALE,
  Fenrir: VoiceGender.MALE,
};

// VoiceName enum value → Gemini API voice name (capitalised first letter)
const VOICE_NAME_TO_GEMINI: Record<VoiceName, string> = {
  [VoiceName.ZEPHYR]: 'Zephyr',
  [VoiceName.KORE]: 'Kore',
  [VoiceName.PUCK]: 'Puck',
  [VoiceName.CHARON]: 'Charon',
  [VoiceName.FENRIR]: 'Fenrir',
};

// Language-specific voice preferences (ordered best → fallback)
const LANGUAGE_VOICE_ORDER: Record<Language, VoiceName[]> = {
  [Language.ENGLISH]: [VoiceName.KORE, VoiceName.ZEPHYR, VoiceName.PUCK, VoiceName.CHARON, VoiceName.FENRIR],
  [Language.SPANISH]: [VoiceName.KORE, VoiceName.ZEPHYR, VoiceName.PUCK, VoiceName.FENRIR],
  [Language.FRENCH]: [VoiceName.ZEPHYR, VoiceName.KORE, VoiceName.PUCK, VoiceName.FENRIR],
  [Language.GERMAN]: [VoiceName.CHARON, VoiceName.ZEPHYR, VoiceName.PUCK, VoiceName.KORE],
  [Language.CHINESE]: [VoiceName.FENRIR, VoiceName.KORE, VoiceName.PUCK, VoiceName.ZEPHYR],
  [Language.JAPANESE]: [VoiceName.FENRIR, VoiceName.KORE, VoiceName.PUCK, VoiceName.ZEPHYR],
  [Language.HINDI]: [VoiceName.KORE, VoiceName.CHARON, VoiceName.FENRIR, VoiceName.ZEPHYR],
  [Language.PORTUGUESE]: [VoiceName.KORE, VoiceName.CHARON, VoiceName.ZEPHYR, VoiceName.PUCK],
  [Language.TAMIL]: [VoiceName.FENRIR, VoiceName.KORE, VoiceName.PUCK, VoiceName.ZEPHYR],
  [Language.TELUGU]: [VoiceName.FENRIR, VoiceName.KORE, VoiceName.PUCK, VoiceName.ZEPHYR],
  [Language.MALAYALAM]: [VoiceName.FENRIR, VoiceName.KORE, VoiceName.PUCK, VoiceName.ZEPHYR],
  [Language.KANNADA]: [VoiceName.FENRIR, VoiceName.KORE, VoiceName.PUCK],
  [Language.BENGALI]: [VoiceName.FENRIR, VoiceName.KORE, VoiceName.PUCK, VoiceName.ZEPHYR],
  [Language.MARATHI]: [VoiceName.FENRIR, VoiceName.KORE, VoiceName.PUCK],
  [Language.GUJARATI]: [VoiceName.FENRIR, VoiceName.KORE, VoiceName.PUCK],
  [Language.PUNJABI]: [VoiceName.FENRIR, VoiceName.KORE, VoiceName.PUCK],
};

// ============================================================================
// Voice Resolution
// ============================================================================

/**
 * Resolve the best Gemini voice based on user preference, language, and gender.
 */
export function resolveGeminiVoice(
  voiceType: string,
  language: Language,
  gender: VoiceGender = VoiceGender.AUTO
): string {
  // 1. Check if voiceType directly maps to a VoiceName
  const directMatch = Object.entries(VOICE_NAME_TO_GEMINI).find(
    ([enumVal]) => enumVal === voiceType
  );
  if (directMatch) {
    const geminiName = directMatch[1];
    // Verify gender preference
    if (gender !== VoiceGender.AUTO && VOICE_GENDER_MAP[geminiName] !== gender) {
      // User wants a different gender — override to a gender-matching voice
      return pickVoiceByGender(language, gender);
    }
    return geminiName;
  }

  // 2. voiceType might be a Google TTS voice name (e.g. "en-US-Standard-C") — ignore it
  return pickVoiceByGender(language, gender);
}

function pickVoiceByGender(language: Language, gender: VoiceGender): string {
  const ordered = LANGUAGE_VOICE_ORDER[language] || LANGUAGE_VOICE_ORDER[Language.ENGLISH];

  if (gender === VoiceGender.AUTO) {
    return VOICE_NAME_TO_GEMINI[ordered[0]];
  }

  const match = ordered.find((v) => {
    const geminiName = VOICE_NAME_TO_GEMINI[v];
    return VOICE_GENDER_MAP[geminiName] === gender;
  });

  return VOICE_NAME_TO_GEMINI[match || ordered[0]];
}

// ============================================================================
// Client-side function (calls the API route)
// ============================================================================

/**
 * Generate speech using the Gemini TTS API route.
 * Returns base64-encoded audio data or empty string on failure.
 */
export async function generateSpeechWithGemini(
  text: string,
  voiceType: string,
  language: Language,
  voiceGender: VoiceGender = VoiceGender.AUTO
): Promise<string> {
  try {
    const voiceName = resolveGeminiVoice(voiceType, language, voiceGender);

    const res = await fetch('/api/chronoread/gemini/tts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text,
        voiceName,
        language,
      }),
    });

    if (!res.ok) {
      const payload = await res.json().catch(() => ({}));
      console.error('Gemini TTS proxy error:', {
        status: res.status,
        response: payload,
        voiceName,
        language,
        voiceGender,
      });
      return '';
    }

    const data = await res.json();
    return data.audio || '';
  } catch (error) {
    console.error('Error generating speech with Gemini TTS:', error);
    return '';
  }
}
