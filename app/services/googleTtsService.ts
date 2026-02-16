import { Language, VoiceGender, DEFAULT_GOOGLE_VOICE } from '../types';

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
  const fallback = filtered[0] || voices[0];
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

    return voices;
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
): Promise<string> {
  try {
    const res = await fetch('/api/chronoread/google/tts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text,
        voice: voiceName || DEFAULT_GOOGLE_VOICE,
        languageCode,
        speakingRate,
        pitch,
      }),
    });

    if (!res.ok) {
      const payload = await res.json().catch(() => ({}));
      console.error('Google TTS proxy error:', payload);
      return '';
    }

    const data = await res.json();
    return data.audio || '';
  } catch (error) {
    console.error('Error generating speech with Google TTS:', error);
    return '';
  }
}
