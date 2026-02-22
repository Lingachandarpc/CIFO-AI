# AI Tools Quick Start Guide

## ⚡ 5-Minute Setup

### Step 1: Install Dependencies (1 minute)

```bash
npm install @anthropic-ai/sdk @google/generative-ai pdfkit docx tesseract.js form-data axios ts-node
```

### Step 2: Add Environment Variables (2 minutes)

Add to `.env.local`:

```env
# OpenAI
OPENAI_API_KEY=sk_...

# Anthropic
ANTHROPIC_API_KEY=sk_ant...

# Google
GOOGLE_API_KEY=AI...

# xAI
XAI_API_KEY=xai_...

# Optional: Image Generation
STABILITY_API_KEY=sk_...

# Optional: Video
PIKA_API_KEY=...
RUNWAY_API_KEY=...
```

### Step 3: Verify Installation (2 minutes)

```bash
npm run list-models
```

Expected output:

```
✓ Model Registry initialized
✓ 28 models loaded
  - OpenAI: 5 models
  - Anthropic: 5 models
  - Google: 5 models
  - xAI: 3 models
  - Specialized: 10 services
```

## 🚀 Usage

### Use in SearchBar

```typescript
import SearchBar from '@/components/SearchBar';

// SearchBar now includes:
// - ✅ "+" button in search field
// - ✅ Dropdown menu (Image, Video, OCR, Document, Dashboard)
// - ✅ File picker for each option
// - ✅ File attachment preview

<SearchBar onSearch={(query, category, attachedFile) => {
  if (attachedFile) {
    // Process attached file with specified tool
    console.log(attachedFile.tool); // 'image' | 'video' | 'ocr' | 'document'
    console.log(attachedFile.base64); // Base64 encoded file
  }
}} />
```

### Get Best Model

```typescript
import { AIModelRegistry } from "@/app/services/modelRegistry";

// Find fastest text model
const model = AIModelRegistry.findBestModel({
  category: "text",
  priority: "speed",
});
// Returns: { id: 'gpt-3.5-turbo', provider: 'openai', ... }

// Find cheapest model
const budget = AIModelRegistry.findBestModel({
  category: "text",
  priority: "cost",
});
// Returns: { id: 'claude-instant', provider: 'anthropic', ... }

// Find highest quality
const quality = AIModelRegistry.findBestModel({
  category: "text",
  priority: "quality",
});
// Returns: { id: 'gpt-4-turbo', provider: 'openai', ... }
```

### List All Models

```typescript
import { AIModelRegistry } from "@/app/services/modelRegistry";

// Get all models
const allModels = AIModelRegistry.getAllModels();
console.log(allModels.length); // 28

// Filter by provider
const openaiModels = AIModelRegistry.getModelsByProvider("openai");
// Returns 5 models

// Filter by category
const textModels = AIModelRegistry.getModelsByCategory("text");
const imageModels = AIModelRegistry.getModelsByCategory("image");
const videoModels = AIModelRegistry.getModelsByCategory("video");
const ocrModels = AIModelRegistry.getModelsByCategory("ocr");

// Get single model
const model = AIModelRegistry.getModel("gpt-4-turbo");

// Get summary
const summary = AIModelRegistry.getSummary();
// Returns: { totalModels: 28, byProvider: {...}, byCategory: {...} }
```

### Generate Image

```typescript
import { aiToolsService } from "@/app/services/aiToolsService";

const response = await aiToolsService.processAIToolRequest({
  type: "image",
  prompt: "A futuristic city at sunset",
  options: {
    size: "1024x1024",
    quality: "hd",
    style: "cinematic",
  },
});

// response.success === true
// response.data contains image URL or base64
```

### Extract Text (OCR)

```typescript
const response = await aiToolsService.processAIToolRequest({
  type: "ocr",
  file: base64ImageData,
  fileName: "document.jpg",
  options: {
    language: "en",
    confidence: 0.8,
  },
});

// response.data contains extracted text
```

### Generate Video

```typescript
const response = await aiToolsService.processAIToolRequest({
  type: "video",
  prompt: "A robot dancing in a city",
  options: {
    duration: 30,
    fps: 24,
    resolution: "1080p",
  },
});

// response.data contains video URL
```

### Generate Document

```typescript
const response = await aiToolsService.processAIToolRequest({
  type: "document",
  prompt: "Generate a professional report about AI trends",
  options: {
    format: "pdf", // 'pdf' | 'docx' | 'markdown'
    title: "AI Trends Report",
    author: "Chronoread AI",
  },
});

// response.data contains document URL or base64
```

## 📊 API Endpoints

### Query Models

```bash
# Get all models
curl http://localhost:3000/api/chronoread/models

# Filter by provider
curl http://localhost:3000/api/chronoread/models?provider=openai

# Filter by category
curl http://localhost:3000/api/chronoread/models?category=text

# Search
curl http://localhost:3000/api/chronoread/models?q=claude

# Get best model
curl -X POST http://localhost:3000/api/chronoread/models \
  -H "Content-Type: application/json" \
  -d '{
    "action": "find-best",
    "criteria": {
      "category": "text",
      "priority": "cost"
    }
  }'
```

### Process AI Tool

```bash
# Generate image
curl -X POST http://localhost:3000/api/chronoread/ai-tools \
  -H "Content-Type: application/json" \
  -d '{
    "type": "image",
    "prompt": "A cat sitting on a moon",
    "options": {"size": "1024x1024"}
  }'

# Extract text from image
curl -X POST http://localhost:3000/api/chronoread/ai-tools \
  -H "Content-Type: application/json" \
  -d '{
    "type": "ocr",
    "file": "<base64-encoded-image>",
    "fileName": "document.jpg"
  }'
```

## 🎨 UI Components

### AIToolsMenu

Appears in SearchBar with "+" button:

```
┌─────────────────────────────┐
│ [+] 🔍 [Search Input...] [SEARCH]
│
│ When clicked shows:
│ ├─ 🎨 Image Creation
│ ├─ 🎬 Video Creation
│ ├─ 📄 OCR
│ ├─ 📝 Document Generation
│ └─ 📊 Dashboard
```

### FileAttachment

Shows below search when file selected:

```
Attached Files (1)
├─ 🖼️ image.jpg (2.3 MB)  [ℹ️] [✕]
└─ 📝 document.pdf (584 KB)
```

## 🧪 Testing

### Test Model Registry

```bash
npx ts-node scripts/list-all-models.ts
```

### Test Models Endpoint

```bash
# Development server
npm run dev

# In another terminal
curl http://localhost:3000/api/chronoread/models | jq

# Check response structure
curl http://localhost:3000/api/chronoread/models?provider=anthropic | jq '.models[] | {id, displayName, context}'
```

### Test AI Tools Endpoint

```bash
# Image generation
curl -X POST http://localhost:3000/api/chronoread/ai-tools \
  -H "Content-Type: application/json" \
  -d '{"type":"image","prompt":"test"}'

# Check response
# Should contain: success (boolean), data (string), type (string), processingTime (number)
```

## 🔧 Configuration Options

### Model Selection Strategy

```typescript
// 1. By category
const category = "text" | "image" | "video" | "ocr" | "audio" | "embeddings";

// 2. By provider
const provider = "openai" | "anthropic" | "google" | "xai" | "specialized";

// 3. By priority
const priority = "speed" | "quality" | "cost";

// 4. By capability
const capability = "longContext" | "multimodal" | "realtime" | "local";
```

### Tool Options

```typescript
type AIToolType = "image" | "video" | "ocr" | "document" | "dashboard";

// Each tool accepts:
// - prompt (string): Description of what to generate
// - file (optional string): Base64 encoded file for OCR/document
// - options (optional object): Tool-specific settings
```

## 📊 Model Comparison

| Provider  | Model          | Type  | Context | Cost     | Speed  | Best For       |
| --------- | -------------- | ----- | ------- | -------- | ------ | -------------- |
| OpenAI    | GPT-4 Turbo    | Text  | 128K    | $10-30/M | ⚡⚡⚡ | Quality        |
| Anthropic | Claude 3 Opus  | Text  | 200K    | $15-75/M | ⚡⚡   | Advanced tasks |
| Google    | Gemini 1.5 Pro | Text  | 1M      | $7-21/M  | ⚡⚡   | Long documents |
| xAI       | Grok-1         | Text  | 128K    | $5/M     | ⚡⚡⚡ | Real-time data |
| OpenAI    | DALL-E 3       | Image | -       | $0.12/M  | ⚡⚡   | High quality   |
| Pika      | Pika 1.0       | Video | -       | -        | ⚡     | Video gen      |
| Google    | Vision API     | OCR   | -       | $1.5/1k  | ⚡⚡⚡ | Accuracy       |

## 🚨 Troubleshooting

### Models endpoint returns empty

**Problem:** `/api/chronoread/models` returns no models

**Solution:**

```bash
# Check if modelRegistry.ts is properly initialized
npm run list-models

# Verify environment variables
echo $OPENAI_API_KEY

# Restart dev server
npm run dev
```

### AI Tools endpoint returns 501

**Problem:** "AI is not configured"

**Solution:**

1. Check `.env.local` has required API keys
2. Verify services are initialized
3. Check console for specific error messages

### File upload fails

**Problem:** File attachment shows upload error

**Solution:**

1. Check file size (max recommended: 50MB)
2. Verify file type is supported
3. Check browser console for errors
4. Try in different format/size

### Slow response times

**Problem:** Tool processing takes 30+ seconds

**Solution:**

1. Switch to faster model (e.g., GPT-3.5 instead of GPT-4)
2. Use priority: 'speed' in model selection
3. Check API provider status
4. Consider timeout settings in config

## 📈 Performance Tips

1. **Cache models list** - Query once at app startup
2. **Use streaming** for large file uploads
3. **Pre-select models** by common tasks
4. **Implement file compression** for large documents
5. **Monitor API usage** to catch runaway costs

## 📚 Complete Documentation

For detailed information, see:

- [AI_TOOLS_DOCUMENTATION.md](AI_TOOLS_DOCUMENTATION.md) - Full API reference
- [SETUP_AI_TOOLS.md](SETUP_AI_TOOLS.md) - Detailed setup guide
- [IMPLEMENTATION_ROADMAP.md](IMPLEMENTATION_ROADMAP.md) - Feature roadmap

## 🎯 Next Steps

1. ✅ Install dependencies
2. ✅ Add environment variables
3. ✅ Run verification: `npm run list-models`
4. ✅ Start dev server: `npm run dev`
5. ✅ Test in UI: Click "+" button in search field
6. ✅ Try each tool: image, video, OCR, document
7. ✅ Monitor costs in production

## 💡 Tips

- Start with **free/low-cost models** to test
- Use **Claude 3 Haiku** for frequent small tasks
- Use **GPT-4 Turbo** for complex reasoning
- Use **Gemini 1.5 Flash** for long documents
- Cache model queries for speed
- Monitor costs with logging

---

**Ready to go!** Your AI tools system is set up and ready to enhance Chronoread with multi-model support and advanced capabilities. 🚀
