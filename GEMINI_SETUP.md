# How to Set Up Gemini AI

## Quick Setup

1. **Get your FREE Gemini API key**
   - Visit: https://aistudio.google.com/app/apikey
   - Sign in with your Google account
   - Click "Create API Key"
   - Copy the generated key (starts with `AIzaSy...`)

2. **Add to .env.local**
   ```bash
   GEMINI_API_KEY=AIzaSyYourActualKeyHere
   ```

3. **Restart the dev server**
   ```bash
   npm run dev
   ```

4. **Select Gemini from Settings**
   - Go to Settings (gear icon)
   - AI Model → Select "Gemini"
   - Save settings

## What's Fixed

### Gemini Service Issues Resolved:
- ✅ Corrected API endpoint structure
- ✅ Changed from `gemini-2.0-flash-exp` to `gemini-1.5-flash-latest` (stable model)
- ✅ Fixed API URL format: `https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={API_KEY}`
- ✅ Added proper error logging with response text
- ✅ Conversation history support (last 5 messages)
- ✅ Tavily web search integration for current data
- ✅ User context and profile support

### Why Gemini is Great:
- **FREE**: 15 requests per minute free tier
- **Fast**: Optimized for speed with Flash model
- **Latest data**: Integrated with Tavily for February 2026 information
- **Context-aware**: Remembers conversation history

## Troubleshooting

### Error: "Gemini API error: 400"
**Cause**: Invalid or missing API key
**Fix**: Get a real API key from https://aistudio.google.com/app/apikey

### Error: "Gemini API key not configured"
**Cause**: GEMINI_API_KEY not set in .env.local
**Fix**: Add `GEMINI_API_KEY=your_key_here` to .env.local and restart server

### Model not working
**Check**:
1. API key is valid (starts with `AIzaSy...`)
2. Dev server restarted after adding key
3. Selected "Gemini" in Settings → AI Model
4. Check browser console for error details

## API Key Limits

### Free Tier (Default):
- 15 requests per minute
- 1 million tokens per minute
- 1,500 requests per day
- Perfect for development and testing

### If you need more:
- Upgrade at: https://ai.google.dev/pricing
- Or use "Auto" mode (falls back to X.AI)

## Current Implementation

### Models Available:
- `gemini-1.5-flash-latest` (default - fast, stable)
- Alternative: `gemini-1.5-pro-latest` (more capable, slower)

### Features:
- Real-time web search via Tavily
- Conversation context (last 5 messages)
- User profile integration
- Multiple languages supported
- Minimal formatting (no excessive emojis/tables)

### How it works:
```
User Query
  ↓
Tavily fetches latest web data (Feb 2026)
  ↓
Gemini receives:
  - Query
  - Last 5 conversation messages
  - Latest web search results
  - User profile/context
  ↓
Generates contextual response
```

## Example Usage

1. Set Gemini API key in .env.local
2. Select "Gemini" in Settings
3. Ask: "What's the financial position of Apollo Hospital?"
4. System fetches 2026 data from Tavily
5. Gemini generates response with current information
6. Follow-up: "Who is the MD?" (remembers Apollo Hospital)

---

**Need help?** Check the console logs for detailed error messages.
