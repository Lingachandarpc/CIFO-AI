# ElevenLabs Integration & Advanced Audio Features Setup Guide

## Overview

This guide covers the integration of **ElevenLabs API** for advanced text-to-speech, genre-specific background music, and enhanced speech-to-text capabilities in the Chronoread application.

## Features Implemented

### 1. **ElevenLabs Text-to-Speech (TTS)**

- 🎙️ Multiple voice personas (Zephyr, Kore, Puck, Charon, Fenrir)
- 🌍 Support for 16+ languages with language-specific voice mapping
- 🎭 Narration style customization (Realistic, Dramatic, Educational)
- ⚙️ Configurable voice stability and similarity settings

### 2. **Genre-Specific Background Music**

- 🎵 Ambient music synchronized with narration content
- 📚 11 genre presets (Personal Finance, Technology, Business, Psychology, Health, History, Science, Self-Help, Fiction, Biography, Default)
- 🎚️ User-adjustable music volume
- 🎛️ Frequency-based ambient synthesis with LFO modulation

### 3. **Enhanced Speech-to-Text (STT)**

- 🗣️ OpenAI Whisper API with language detection
- 🌐 Automatic language code conversion for accuracy
- 📝 Support for all 16 supported languages

### 4. **Provider Selection**

- 🔄 User can choose between OpenAI and ElevenLabs TTS
- 📱 Settings persist across sessions
- ⚡ Fallback mechanisms for API failures

---

## Setup Instructions

### Prerequisites

- Node.js 20+
- npm or yarn package manager
- ElevenLabs and OpenAI API keys

### 1. Environment Variables

Create or update `.env.local` with:

```env
# OpenAI API Key (for Narrative Generation & Whisper STT)
OPENAI_API_KEY=sk_test_xxxxxxxxxxxxxxxxxxxxxxxxxxxx

# ElevenLabs API Key (for Advanced TTS)
ELEVENLABS_API_KEY=sk_xxxxxxxxxxxxxxxxxxxxxxxxxxxx

# Optional: For STT with ffmpeg conversion (recommended)
# Make sure ffmpeg is installed: brew install ffmpeg (macOS) or apt install ffmpeg (Linux)
```

### 2. Install Dependencies

No additional npm packages are required beyond what's already in `package.json`. The integration uses:

- OpenAI SDK (already included)
- Native Web Audio API (client-side)
- Native SpeechRecognition API (client-side)

If using ffmpeg conversion for audio (STT):

```bash
# macOS
brew install ffmpeg

# Linux
sudo apt-get install ffmpeg

# Windows
choco install ffmpeg
```

### 3. Verify API Keys

Test your API keys:

```bash
# OpenAI
curl https://api.openai.com/v1/models \
  -H "Authorization: Bearer $OPENAI_API_KEY"

# ElevenLabs
curl https://api.elevenlabs.io/v1/voices \
  -H "xi-api-key: $ELEVENLABS_API_KEY"
```

---

## API Routes Added

### ElevenLabs TTS Endpoint

```
POST /api/chronoread/elevenlabs/tts
```

**Request:**

```json
{
  "text": "The narration text here",
  "voiceId": "EXAVITQu4vr4xnSDxMaL",
  "language": "English",
  "stability": 0.5,
  "similarity_boost": 0.75
}
```

**Response:**

```json
{
  "audio": "base64_encoded_mp3_audio"
}
```

### Speech-to-Text Endpoint

```
POST /api/chronoread/stt
```

**Request:** (multipart/form-data)

- `file`: Audio blob (webm, mp3, wav)
- `language`: Optional language code (e.g., "en", "es", "hi")

**Response:**

```json
{
  "text": "Transcribed text from audio"
}
```

---

## Services & Components

### 1. elevenLabsService.ts

**Location:** `app/services/elevenLabsService.ts`

**Key Exports:**

- `generateSpeechWithElevenLabs()` - Generate speech via ElevenLabs
- `getVoicesForLanguage()` - Get available voices for a language
- `ELEVENLABS_VOICES` - Voice configuration map
- `NARRATION_SETTINGS` - Style-specific voice settings

**Example Usage:**

```typescript
import {
  generateSpeechWithElevenLabs,
  getVoicesForLanguage,
} from "./services/elevenLabsService";

const audio = await generateSpeechWithElevenLabs(
  "Hello world",
  VoiceName.KORE,
  Language.ENGLISH,
  "Dramatic",
);
```

### 2. backgroundMusicService.ts

**Location:** `app/services/backgroundMusicService.ts`

**Key Exports:**

- `createAmbientMusicForGenre()` - Create genre-specific ambient music
- `stopAmbientMusic()` - Stop and clean up music
- `updateMusicVolume()` - Adjust music volume
- `GENRE_MUSIC` - Genre sound configuration presets

**Example Usage:**

```typescript
import { createAmbientMusicForGenre } from "./services/backgroundMusicService";

const music = createAmbientMusicForGenre(audioContext, Genre.PSYCHOLOGY, 0.15);
```

### 3. Updated openaiService.ts

**Location:** `app/services/openaiService.ts`

**New Functions:**

- `transcribeAudio()` - Transcribe audio using Whisper API
- `getLanguageCode()` - Convert Language enum to BCP-47 format

**Example Usage:**

```typescript
import { transcribeAudio } from "./services/openaiService";

const text = await transcribeAudio(audioBlob, Language.HINDI);
```

### 4. SettingsModal Component

**Location:** `components/SettingsModal.tsx`

**Features:**

- TTS provider selection (OpenAI / ElevenLabs)
- Language selection with voice availability checking
- Voice persona selection (voice filtered by language)
- Narration style selection
- Duration slider
- Background music toggle & volume control

---

## Voice & Language Support Matrix

### Voices Available

| Voice      | ID          | Languages               | Ideal For                 |
| ---------- | ----------- | ----------------------- | ------------------------- |
| **Zephyr** | EXAVITQu... | EN,ES,FR,DE,PT          | Professional, educational |
| **Kore**   | jsCqWAov... | EN,ES,FR,DE,PT,HI       | Warm storytelling         |
| **Puck**   | jBpfuIE2... | EN,ES,FR,DE,PT          | Energetic, case studies   |
| **Charon** | pFZP5JQG... | EN,DE,PT,HI             | Deep, dramatic            |
| **Fenrir** | bIHbv24M... | EN,ES,FR,PT,HI,TA,TE,ML | Soothing, inclusive       |

### Languages Supported

- English, Spanish, French, German, Chinese, Japanese
- Hindi, Portuguese, Tamil, Telugu, Malayalam
- Kannada, Bengali, Marathi, Gujarati, Punjabi

---

## Genre Music Presets

Each genre has specific audio characteristics:

### Personal Finance

- Frequencies: 130Hz, 164Hz, 196Hz (low, warm, professional)
- Filter: 800Hz lowpass
- Modulation: 0.5Hz tremolo

### Technology

- Frequencies: 220Hz, 277Hz, 330Hz (mid-range, bright)
- Filter: 2000Hz lowpass
- Modulation: 1.2Hz tremolo

### Business

- Frequencies: 165Hz, 220Hz, 275Hz (professional, confident)
- Filter: 1200Hz lowpass
- Modulation: 0.6Hz tremolo

### Psychology

- Frequencies: 110Hz, 147Hz, 196Hz (deep, introspective)
- Filter: 600Hz lowpass (heavily filtered)
- Modulation: 0.3Hz tremolo (subtle)

### Health & Wellness

- Frequencies: 264Hz, 297Hz, 330Hz (healing, balanced)
- Filter: 1000Hz lowpass
- Modulation: 0.4Hz tremolo

_And 6 more genre presets..._

---

## Usage Examples

### Example 1: Generate Narration with ElevenLabs in Listen Mode

```typescript
// In HomeView.tsx or listen handler
const narrative = await generateNarrative(
  userQuery,
  SearchMode.BOOK,
  settings,
  [],
);
const { cleanedText, genre } = extractListenMetadata(narrative);

// Generate speech with ElevenLabs
const audio = await generateNarrationAudio(cleanedText.slice(0, 1200));

// Play with genre-specific music
if (settings.enableBackgroundMusic) {
  await startAmbientMusic(genre);
}
handlePlayAudio(audio, { listenMode: true, genre });
```

### Example 2: Switch TTS Provider at Runtime

```typescript
// User changes TTS provider in settings
setSettings({
  ...settings,
  ttsProvider: TextToSpeechProvider.ELEVENLABS,
});

// All subsequent generateNarrationAudio() calls use ElevenLabs
```

### Example 3: Language-Aware Voice Selection

```typescript
import { getVoicesForLanguage } from "./services/elevenLabsService";

const voicesForHindi = getVoicesForLanguage(Language.HINDI);
// Returns: [VoiceName.KORE, VoiceName.CHARON, VoiceName.FENRIR, VoiceName.ZEPHYR]
```

### Example 4: Transcribe User Input in Hindi

```typescript
// Capture audio blob from browser
const audioBlob = /* from MediaRecorder or Web Audio API */;

// Transcribe with language hint
const text = await transcribeAudio(audioBlob, Language.HINDI);
```

---

## Settings Structure

```typescript
interface Settings {
  narrationTime: number; // 2-15 minutes
  narrationType: "Realistic" | "Dramatic" | "Educational";
  voiceType: VoiceName; // ZEPHYR, KORE, PUCK, CHARON, FENRIR
  language: Language; // 16 languages
  ttsProvider: TextToSpeechProvider; // OPENAI or ELEVENLABS
  enableBackgroundMusic: boolean; // Toggle genre music
  backgroundMusicVolume: number; // 0.0 - 1.0
}
```

---

## Error Handling

### Missing API Keys

- If `ELEVENLABS_API_KEY` is missing, returns 501 status
- If `OPENAI_API_KEY` is missing, returns 501 status
- Client falls back gracefully with error messages

### Audio Decoding Failures

- Attempts AudioContext decoding; catches errors silently
- Returns null buffer; client handles missing audio state

### Language Support Warnings

- Voice doesn't support language → logs warning, falls back to ENGLISH
- Graceful degradation ensures functionality

---

## Performance Considerations

### Audio Streaming

- TTS responses returned as base64 (optimized for browser transmission)
- ~2-3 minute narrations = ~150-200KB MP3 audio (base64 encoded)

### Background Music

- Synthesized in real-time using Web Audio API oscillators
- Minimal CPU footprint (3 oscillators + 1 LFO)
- Smooth fade-out over 500ms when stopped

### Caching

- Audio blobs cached in HistoryItem for instant replay
- localStorage limited to 20 items with 4000-char responses max (auto-trims if quota exceeded)

---

##Troubleshooting

### "Setting value exceeded quota" Error

- **Cause:** History items too large (audio blobs + responses)
- **Solution:** Already handled by `persistHistory()` helper - strips audio/truncates responses automatically

### ElevenLabs API 401 Unauthorized

- **Cause:** Invalid or missing API key
- **Solution:** Verify `ELEVENLABS_API_KEY` in `.env.local`

### Whisper Transcription Empty

- **Cause:** Poor audio quality or ffmpeg not installed
- **Solution:** Ensure audio is clear; optionally install ffmpeg for format conversion

### No Voices Available for Language

- **Cause:** Language not in voice support matrix
- **Solution:** Falls back to FENRIR (most inclusive); consider adding voice in `VOICE_BY_LANGUAGE` map

### Background Music Doesn't Start

- **Cause:** `enableBackgroundMusic` is false in settings
- **Solution:** Toggle in Settings modal

---

## Future Enhancements

- [x] ElevenLabs multi-language support
- [x] Genre-specific ambient music
- [x] Provider selection UI
- [ ] Custom voice cloning (ElevenLabs Premium)
- [ ] SSML support for advanced prosody control
- [ ] Audio visualization during narration
- [ ] Subscription management for API usage tracking
- [ ] Offline mode with cached voices

---

## Support & Resources

- **ElevenLabs Docs:** https://api.elevenlabs.io/docs
- **OpenAI API:** https://platform.openai.com/docs
- **Web Audio API:** https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API
- **Speech Recognition API:** https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition

---

**Last Updated:** February 2026  
**Version:** 1.0.0
