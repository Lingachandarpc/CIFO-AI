# 🚀 Quick Start: ElevenLabs Integration

## 1. Set Environment Variables

Add to `.env.local`:

```env
ELEVENLABS_API_KEY=sk_xxxxxxxxxxxxxxxxxxxx
OPENAI_API_KEY=sk_xxxxxxxxxxxxxxxxxxxx
```

Get your API keys:

- **ElevenLabs:** https://elevenlabs.io/app/sign-up
- **OpenAI:** https://platform.openai.com/api-keys

## 2. Install ffmpeg (Optional, for STT)

```bash
# macOS
brew install ffmpeg

# Ubuntu/Debian
sudo apt-get install ffmpeg

# Windows (via Chocolatey)
choco install ffmpeg
```

## 3. Run the App

```bash
npm run dev
# Open http://localhost:3000
```

## 4. Try It Out

### Open Settings

- Click the **⚙️ Settings** button
- Select **ElevenLabs (Advanced)** as TTS Provider
- Choose a **Language** (e.g., "English")
- Pick a **Voice Persona** (e.g., "Kore")
- Toggle **Genre-Specific Background Music** ON

### Generate a Narration

1. Choose **Book** or **Case Study** mode
2. Enter a query (e.g., "Rich Dad Poor Dad wealth principles")
3. Click **SEARCH**
4. Listen to the narration with:
   - ✅ ElevenLabs voice
   - ✅ Genre-specific background music
   - ✅ Full language support

### Switch Providers

- Go back to Settings
- Select **OpenAI** to switch back anytime

## 5. File Structure

```
app/
├── services/
│   ├── elevenLabsService.ts        ← ElevenLabs TTS
│   ├── backgroundMusicService.ts   ← Genre music
│   └── openaiService.ts            ← Updated with STT
├── api/chronoread/
│   ├── elevenlabs/tts/route.ts     ← TTS endpoint
│   └── stt/route.ts                ← Speech-to-text
└── HomeView.tsx                    ← Updated with new features

components/
└── SettingsModal.tsx               ← Enhanced settings UI
```

## 6. Key Features

| Feature               | Details                           |
| --------------------- | --------------------------------- |
| 🎙️ Voices             | 5 personas × 16 languages         |
| 🎭 Narration Styles   | Realistic, Dramatic, Educational  |
| 🎵 Background Music   | 11 genres with adaptive synthesis |
| 🌐 Languages          | 16+ supported languages           |
| 🔄 Provider Switching | OpenAI ↔ ElevenLabs               |
| ⏱️ Duration           | 2-15 minute narrations            |

## 7. API Usage

### ElevenLabs TTS

```
POST /api/chronoread/elevenlabs/tts
{
  "text": "Your narration text",
  "voiceId": "EXAVITQu4vr4xnSDxMaL",
  "language": "English",
  "stability": 0.5,
  "similarity_boost": 0.75
}
```

### OpenAI Speech-to-Text

```
POST /api/chronoread/stt
(multipart form-data)
file: <audio blob>
language: "en"
```

## 8. Troubleshooting

| Issue                         | Solution                                   |
| ----------------------------- | ------------------------------------------ |
| "API key missing"             | Check `.env.local` has both keys           |
| No voices available           | Ensure language is in voice support matrix |
| Background music doesn't play | Toggle in Settings modal                   |
| Slow narration generation     | Check API rate limits                      |

## 9. Learn More

- [Full Integration Guide](./ELEVENLABS_INTEGRATION.md)
- [Implementation Summary](./INTEGRATION_SUMMARY.md)
- [ElevenLabs API Docs](https://api.elevenlabs.io/docs)
- [OpenAI API Docs](https://platform.openai.com/docs)

---

**Status:** ✅ Ready to use  
**Setup Time:** ~5 minutes  
**First Narration:** ~10 seconds
