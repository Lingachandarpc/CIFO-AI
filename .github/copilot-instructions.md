# AI Coding Agent Instructions for Chronoread

## Project Overview
**Chronoread** is a Next.js 16 full-stack application that generates AI-powered audio narratives from books, case studies, and discovery-based content. It combines:
- **Frontend**: React 19 client-side UI with voice input/output capabilities
- **Backend API**: Next.js API routes proxying OpenAI (narrative generation + text-to-speech)
- **External Services**: OpenAI GPT-4.1-mini (narratives), OpenAI TTS (audio), optional Gemini integration

## Architecture & Data Flow

### Core Components
1. **[app/page.tsx](app/page.tsx)** - Main UI with state management (messages, settings, history)
2. **[app/services/openaiService.ts](app/services/openaiService.ts)** - Client-side service layer, fetches from `/api/chronoread/*`
3. **[app/api/chronoread/ai/route.ts](app/api/chronoread/ai/route.ts)** - OpenAI narrative generation endpoint
4. **[app/api/chronoread/tts/route.ts](app/api/chronoread/tts/route.ts)** - Text-to-speech endpoint (returns base64 MP3)
5. **[app/api/chronoread/discover/route.ts](app/api/chronoread/discover/route.ts)** - Discovery topics endpoint with fallback

### Data Flow: User Query → Narration → Audio
```
User Input (SearchBar) 
  → openaiService.generateNarrative() [POST /api/chronoread/ai]
  → openaiService.generateSpeech() [POST /api/chronoread/tts]
  → Audio playback via Web Audio API (24kHz AudioContext)
  → ChatMessage added to state with audioBlob
```

### Type System
- **SearchMode**: BOOK or CASE_STUDY (determines AI context)
- **Language**: 16 languages supported (English, Spanish, Hindi, Tamil, Telugu, etc.)
- **VoiceName**: 5 voices (ZEPHYR→alloy, KORE→nova, PUCK→fable, CHARON→onyx, FENRIR→echo)
- **Settings**: narrationTime (5 min default), narrationType (Realistic/Dramatic/Educational), voiceType, language

## Critical Patterns & Conventions

### Service Layer Pattern
- **openaiService.ts**: Actively maintained with OpenAI API calls (production)
- **geminiService.ts**: Mock implementation for testing/fallback — replace function bodies for Gemini API
- Always return error messages instead of throwing in service functions

### API Route Conventions
- All routes: `export const runtime = "nodejs"` (required for external API calls)
- Discovery endpoint: `export const dynamic = "force-dynamic"` (prevent caching)
- Always validate `OPENAI_API_KEY` env var; return 501 if missing
- Return base64 audio from TTS (not raw binary) for client transmission

### Client State Management (page.tsx)
- **messages**: ChatMessage[] with role, content, timestamp, mode, audioBlob
- **settings**: Controls narration behavior; synced across all narratives
- **history**: HistoryItem[] for replay functionality
- **audioContextRef**: Singleton AudioContext (24kHz, handles browser compat)
- Speech Recognition: Handles lang mapping (Language enum → Browser locale codes)

### UI Component Structure
- **[components/SearchBar.tsx](components/SearchBar.tsx)** - Input + SEARCH button (lime-400 accent color)
- **[components/NarrationModal.tsx](components/NarrationModal.tsx)** - Content display + Play button
- **[components/Icons.tsx](components/Icons.tsx)** - Icon definitions for modes (BookIcon, SettingsIcon, etc.)
- **[components/ContentRow.tsx](components/ContentRow.tsx)** - Discovery content grid
- Styling: Tailwind v4, dark theme (bg-gray-900), accent color lime-400

## Build & Run Commands
```bash
npm run dev          # Start dev server (localhost:3000, hot reload)
npm run build        # Build for production
npm start            # Start production server
npm run lint         # Run ESLint on codebase
```

## Environment & Dependencies
- **Node.js**: 20+ (via @types/node)
- **Key deps**: next 16.1.4, react 19.2.3, openai 6.16.0, lucide-react (icons)
- **Styling**: tailwindcss 4.1.18 + postcss
- **Required env vars**: `OPENAI_API_KEY` (must be set for AI endpoints)

## Testing & Mocking Strategy
- **No test framework configured** — add Jest/Vitest if needed
- **Mock fallback in discover route**: Static topics array returned if OPENAI_API_KEY missing
- **geminiService.ts**: Mock timings (1000ms for narrative, 500ms for speech) for UI testing
- For local testing without API keys: use Gemini service or mock

## Common Workflows

### Adding a New Voice
1. Add to `VoiceName` enum in [app/types.ts](app/types.ts)
2. Update voiceMap in [app/services/openaiService.ts](app/services/openaiService.ts) (VoiceName → OpenAI voice name)
3. Voice auto-selects in settings dropdown

### Adding a New Language
1. Add to `Language` enum in [app/types.ts](app/types.ts)
2. Update langMap in [app/page.tsx](app/page.tsx#L65) (Language → BCP-47 locale code for Speech Recognition)
3. Language appears in settings UI

### Integrating Gemini API
- Replace mock functions in [app/services/geminiService.ts](app/services/geminiService.ts)
- Create `/api/chronoread/gemini/*` routes (mirror OpenAI routes)
- Update [app/page.tsx](app/page.tsx) service imports to switch provider

## Error Handling Patterns
- **Network errors**: Return user-friendly message "Sorry — AI is unavailable right now"
- **Missing API key**: Return 501 (not configured) rather than 500
- **Audio decoding**: Graceful fallback in AudioContext creation (line 100+)
- **Speech Recognition**: Catches errors without throwing; silently fails

## Notes for AI Agents
- **TypeScript strict mode**: Enforce on all changes
- **"use client" directive**: All interactive components need this
- **API isolation**: Keep business logic on backend (API routes), UI in client components
- **State lifting**: Complex state (messages, history) lives in page.tsx; pass via props
- **Refs for persistent objects**: AudioContext, SpeechRecognition via useRef
- **No CSS-in-JS**: Use Tailwind utilities only; avoid inline styles
