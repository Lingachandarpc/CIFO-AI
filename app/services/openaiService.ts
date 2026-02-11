import { SearchMode, Settings, VoiceName } from '../types';

const API_BASE = '/api/chronoread';

export async function generateNarrative(
  query: string,
  mode: SearchMode,
  settings: Settings,
  chatHistory: Array<{ role: string; content: string }>
): Promise<string> {
  try {
    const category = mode === SearchMode.BOOK ? 'Book' : mode === SearchMode.CASE_STUDY ? 'Case Study' : 'Ask';
    const res = await fetch(`${API_BASE}/ai`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        query, 
        category,
        narrationTime: settings.narrationTime,
        narrationType: settings.narrationType,
        language: settings.language,
      }),
    });

    if (!res.ok) {
      const payload = await res.json().catch(() => ({}));
      console.error('AI proxy error:', payload);
      return 'Sorry — AI is unavailable right now.';
    }

    const data = await res.json();
    return data.narration || '';
  } catch (error) {
    console.error('Error generating narrative (proxy):', error);
    throw error;
  }
}

export async function generateSpeech(text: string, voiceType: VoiceName): Promise<string> {
  try {
    const voiceMap: Record<VoiceName, string> = {
      [VoiceName.ZEPHYR]: 'alloy',
      [VoiceName.KORE]: 'nova',
      [VoiceName.PUCK]: 'fable',
      [VoiceName.CHARON]: 'onyx',
      [VoiceName.FENRIR]: 'echo',
    };

    const res = await fetch(`${API_BASE}/tts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, voice: voiceMap[voiceType] }),
    });

    if (!res.ok) {
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
