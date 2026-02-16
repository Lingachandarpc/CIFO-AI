import { Language, VoiceName, VoiceGender } from '../types';

// ElevenLabs voice IDs with language and persona support
export const ELEVENLABS_VOICES: Record<
  VoiceName,
  {
    name: string;
    id: string;
    languages: Language[];
    description: string;
    gender: VoiceGender;
  }
> = {
  [VoiceName.ZEPHYR]: {
    name: 'Zephyr',
    id: 'EXAVITQu4vr4xnSDxMaL', // Calm, clear, sophisticated
    languages: [
      Language.ENGLISH,
      Language.SPANISH,
      Language.FRENCH,
      Language.GERMAN,
      Language.PORTUGUESE,
    ],
    description: 'Clear, calm, professional tone - ideal for educational content',
    gender: VoiceGender.FEMALE,
  },
  [VoiceName.KORE]: {
    name: 'Kore',
    id: 'jsCqWAovK2LW7UzRXChj', // Warm, engaging, charismatic
    languages: [
      Language.ENGLISH,
      Language.SPANISH,
      Language.FRENCH,
      Language.GERMAN,
      Language.PORTUGUESE,
      Language.HINDI,
    ],
    description: 'Warm, engaging tone - perfect for storytelling and narratives',
    gender: VoiceGender.FEMALE,
  },
  [VoiceName.PUCK]: {
    name: 'Puck',
    id: 'jBpfuIE2acCO8z3wKNLl', // Dynamic, energetic, youthful
    languages: [
      Language.ENGLISH,
      Language.SPANISH,
      Language.FRENCH,
      Language.GERMAN,
      Language.PORTUGUESE,
    ],
    description: 'Energetic, dynamic tone - great for case studies and business content',
    gender: VoiceGender.MALE,
  },
  [VoiceName.CHARON]: {
    name: 'Charon',
    id: 'pFZP5JQG7iQjIQuC4Sse', // Deep, authoritative, dramatic
    languages: [
      Language.ENGLISH,
      Language.GERMAN,
      Language.PORTUGUESE,
      Language.HINDI,
    ],
    description: 'Deep, authoritative tone - excellent for dramatic narration',
    gender: VoiceGender.MALE,
  },
  [VoiceName.FENRIR]: {
    name: 'Fenrir',
    id: 'bIHbv24MWmeRgasZH58o', // Gentle, soothing, calming
    languages: [
      Language.ENGLISH,
      Language.SPANISH,
      Language.FRENCH,
      Language.PORTUGUESE,
      Language.HINDI,
      Language.TAMIL,
      Language.TELUGU,
      Language.MALAYALAM,
    ],
    description: 'Gentle, soothing tone - perfect for relaxing listen sessions',
    gender: VoiceGender.MALE,
  },
};

// Language-specific voice recommendations
export const VOICE_BY_LANGUAGE: Record<Language, VoiceName[]> = {
  [Language.ENGLISH]: [
    VoiceName.KORE,
    VoiceName.ZEPHYR,
    VoiceName.PUCK,
    VoiceName.CHARON,
    VoiceName.FENRIR,
  ],
  [Language.SPANISH]: [
    VoiceName.KORE,
    VoiceName.ZEPHYR,
    VoiceName.PUCK,
    VoiceName.FENRIR,
  ],
  [Language.FRENCH]: [
    VoiceName.ZEPHYR,
    VoiceName.KORE,
    VoiceName.PUCK,
    VoiceName.FENRIR,
  ],
  [Language.GERMAN]: [
    VoiceName.CHARON,
    VoiceName.ZEPHYR,
    VoiceName.PUCK,
    VoiceName.KORE,
  ],
  [Language.CHINESE]: [VoiceName.FENRIR, VoiceName.KORE], // Limited support
  [Language.JAPANESE]: [VoiceName.FENRIR, VoiceName.KORE], // Limited support
  [Language.HINDI]: [
    VoiceName.KORE,
    VoiceName.CHARON,
    VoiceName.FENRIR,
    VoiceName.ZEPHYR,
  ],
  [Language.PORTUGUESE]: [
    VoiceName.KORE,
    VoiceName.CHARON,
    VoiceName.ZEPHYR,
    VoiceName.PUCK,
  ],
  [Language.TAMIL]: [VoiceName.FENRIR, VoiceName.KORE],
  [Language.TELUGU]: [VoiceName.FENRIR, VoiceName.KORE],
  [Language.MALAYALAM]: [VoiceName.FENRIR, VoiceName.KORE],
  [Language.KANNADA]: [VoiceName.FENRIR], // Limited support
  [Language.BENGALI]: [VoiceName.FENRIR, VoiceName.KORE],
  [Language.MARATHI]: [VoiceName.FENRIR],
  [Language.GUJARATI]: [VoiceName.FENRIR],
  [Language.PUNJABI]: [VoiceName.FENRIR],
};

// Narration type to stability/clarity settings mapping
export const NARRATION_SETTINGS: Record<
  string,
  { stability: number; similarity_boost: number }
> = {
  Realistic: {
    stability: 0.5,
    similarity_boost: 0.8, // More variation in tone
  },
  Dramatic: {
    stability: 0.4,
    similarity_boost: 0.9, // High expression with character consistency
  },
  Educational: {
    stability: 0.7,
    similarity_boost: 0.81, // Clearer, more consistent
  },
};

export async function generateSpeechWithElevenLabs(
  text: string,
  voiceType: string,
  language: Language,
  narrationType: 'Realistic' | 'Dramatic' | 'Educational',
  voiceGender: VoiceGender = VoiceGender.AUTO
): Promise<string> {
  try {
    const voiceSettings = NARRATION_SETTINGS[narrationType] || NARRATION_SETTINGS.Realistic;
    const preferredVoices = getVoicesForLanguageAndGender(language, voiceGender);
    const languageVoices = getVoicesForLanguage(language);
    const isLegacyVoice = Object.values(VoiceName).includes(voiceType as VoiceName);
    const legacyVoice = isLegacyVoice ? (voiceType as VoiceName) : VoiceName.FENRIR;
    const resolvedVoiceType = preferredVoices.includes(legacyVoice)
      ? legacyVoice
      : preferredVoices[0] || languageVoices[0] || VoiceName.FENRIR;
    const voice = ELEVENLABS_VOICES[resolvedVoiceType];

    if (!voice) {
      console.error(`Voice ${resolvedVoiceType} not found in ElevenLabs configuration`);
      return '';
    }

    // Check language support
    if (!voice.languages.includes(language)) {
      console.warn(
        `Language ${language} not supported by voice ${resolvedVoiceType}, falling back to ENGLISH`
      );
    }

    const res = await fetch('/api/chronoread/elevenlabs/tts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text,
        voiceId: voice.id,
        stability: voiceSettings.stability,
        similarity_boost: voiceSettings.similarity_boost,
      }),
    });

    if (!res.ok) {
      const payload = await res.json().catch(() => ({}));
      console.error('ElevenLabs TTS proxy error:', {
        status: res.status,
        statusText: res.statusText,
        response: payload,
        voiceType: resolvedVoiceType,
        language,
        voiceGender,
      });
      return '';
    }

    const data = await res.json();
    return data.audio || '';
  } catch (error) {
    console.error('Error generating speech with ElevenLabs:', error);
    return '';
  }
}

export function getVoicesForLanguage(language: Language): VoiceName[] {
  return VOICE_BY_LANGUAGE[language] || [VoiceName.FENRIR];
}

export function getVoicesForLanguageAndGender(
  language: Language,
  gender: VoiceGender = VoiceGender.AUTO
): VoiceName[] {
  const voices = getVoicesForLanguage(language);
  if (gender === VoiceGender.AUTO) return voices;
  return voices.filter((voiceName) => ELEVENLABS_VOICES[voiceName]?.gender === gender);
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
