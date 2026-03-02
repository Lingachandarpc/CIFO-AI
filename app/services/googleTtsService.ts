import { Language, VoiceGender, DEFAULT_GOOGLE_VOICE } from '../types';

export type GoogleTtsAudioPayload = {
  audio: string;
  mimeType: string;
};

export type GoogleVoice = {
  name: string;
  languageCodes: string[];
  ssmlGender: 'MALE' | 'FEMALE' | 'NEUTRAL' | 'SSML_VOICE_GENDER_UNSPECIFIED';
  naturalSampleRateHertz?: number;
};

const LANGUAGE_CODE_MAP: Record<Language, string> = {
  [Language.ENGLISH]: 'en-US',
  [Language.SPANISH]: 'es-ES',
  [Language.FRENCH]: 'fr-FR',
  [Language.GERMAN]: 'de-DE',
  [Language.CHINESE]: 'zh-CN',
  [Language.JAPANESE]: 'ja-JP',
  [Language.HINDI]: 'hi-IN',
  [Language.PORTUGUESE]: 'pt-PT',
  [Language.TAMIL]: 'ta-IN',
  [Language.TELUGU]: 'te-IN',
  [Language.MALAYALAM]: 'ml-IN',
  [Language.KANNADA]: 'kn-IN',
  [Language.BENGALI]: 'bn-IN',
  [Language.MARATHI]: 'mr-IN',
  [Language.GUJARATI]: 'gu-IN',
  [Language.PUNJABI]: 'pa-IN',
};

const FALLBACK_VOICE = (languageCode: string): GoogleVoice => ({
  name: `${languageCode}-Standard-A`,
  languageCodes: [languageCode],
  ssmlGender: 'NEUTRAL',
});

const QUALITY_HINTS = ['Neural2', 'Wavenet', 'Studio', 'Journey', 'Standard'];

const isEnglishLanguage = (languageCode: string) => languageCode.startsWith('en-');

const getInlineEnglishLang = (languageCode: string) =>
  languageCode.endsWith('-IN') ? 'en-IN' : 'en-US';

const escapeXml = (value: string) =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const buildGoogleSsml = (text: string, languageCode: string) => {
  if (!text || isEnglishLanguage(languageCode)) return '';

  const englishLang = getInlineEnglishLang(languageCode);
  const tokenRegex = /([A-Za-z][A-Za-z'.\-]{1,})/g;
  const wrapped = escapeXml(text).replace(tokenRegex, (match) =>
    `<lang xml:lang="${englishLang}">${match}</lang>`
  );

  return `<speak><lang xml:lang="${languageCode}">${wrapped}</lang></speak>`;
};

const sortVoicesByQuality = (voices: GoogleVoice[]) => {
  return [...voices].sort((a, b) => {
    const aIndex = QUALITY_HINTS.findIndex((hint) => a.name.includes(hint));
    const bIndex = QUALITY_HINTS.findIndex((hint) => b.name.includes(hint));
    const aScore = aIndex === -1 ? QUALITY_HINTS.length : aIndex;
    const bScore = bIndex === -1 ? QUALITY_HINTS.length : bIndex;
    return aScore - bScore;
  });
};

export const getGoogleLanguageCode = (language: Language): string =>
  LANGUAGE_CODE_MAP[language] || 'en-US';

export const filterVoicesByGender = (
  voices: GoogleVoice[],
  gender: VoiceGender
): GoogleVoice[] => {
  if (gender === VoiceGender.AUTO) return voices;
  const target = gender === VoiceGender.MALE ? 'MALE' : 'FEMALE';
  const filtered = voices.filter((voice) => voice.ssmlGender === target);
  return filtered.length ? filtered : voices;
};

export const resolveGoogleVoice = (
  voices: GoogleVoice[],
  desiredName: string,
  gender: VoiceGender
): GoogleVoice | null => {
  if (!voices.length) return null;
  const filtered = filterVoicesByGender(voices, gender);
  const exact = filtered.find((voice) => voice.name === desiredName);
  if (exact) return exact;
  const fallback = sortVoicesByQuality(filtered)[0] || sortVoicesByQuality(voices)[0];
  return fallback || null;
};

export async function listGoogleVoices(language: Language): Promise<GoogleVoice[]> {
  const languageCode = getGoogleLanguageCode(language);
  try {
    const res = await fetch(
      `/api/chronoread/google/voices?languageCode=${encodeURIComponent(languageCode)}`,
      { cache: 'no-store' }
    );

    if (!res.ok) {
      return [FALLBACK_VOICE(languageCode)];
    }

    const data = await res.json();
    const voices = Array.isArray(data?.voices) ? data.voices : [];
    if (voices.length === 0) {
      return [FALLBACK_VOICE(languageCode)];
    }

    return sortVoicesByQuality(voices);
  } catch (error) {
    console.error('Failed to load Google voices:', error);
    return [FALLBACK_VOICE(languageCode)];
  }
}

export async function generateSpeechWithGoogle(
  text: string,
  voiceName: string,
  languageCode: string,
  speakingRate = 1.0,
  pitch = 0
): Promise<GoogleTtsAudioPayload> {
  try {
    const ssml = buildGoogleSsml(text, languageCode);
    const res = await fetch('/api/chronoread/google/tts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text,
        ssml,
        voice: voiceName || DEFAULT_GOOGLE_VOICE,
        languageCode,
        speakingRate,
        pitch,
      }),
    });

    if (!res.ok) {
      const payload = await res.json().catch(() => ({}));
      console.error('Google TTS proxy error:', payload);
      return { audio: '', mimeType: 'audio/mpeg' };
    }

    const data = await res.json();
    return {
      audio: data.audio || '',
      mimeType: data.mimeType || 'audio/mpeg',
    };
  } catch (error) {
    console.error('Error generating speech with Google TTS:', error);
    return { audio: '', mimeType: 'audio/mpeg' };
  }
}
