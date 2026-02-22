# AI Tools & Model System - Installation & Setup Guide

## Quick Start

### 1. Install Additional Dependencies

The AI Tools system requires several additional packages. Run:

```bash
npm install \
  @anthropic-ai/sdk \
  @google/generative-ai \
  pdfkit \
  docx \
  tesseract.js \
  form-data \
  axios

# Or for specific use cases:
npm install --save-dev ts-node
```

### 2. Updated package.json

Add these to your `package.json`:

```json
{
  "dependencies": {
    "@anthropic-ai/sdk": "^0.20.0",
    "@google/generative-ai": "^0.11.0",
    "pdfkit": "^0.14.0",
    "docx": "^8.5.0",
    "tesseract.js": "^5.0.0",
    "form-data": "^4.0.0",
    "axios": "^1.6.0"
  },
  "devDependencies": {
    "ts-node": "^10.9.0"
  },
  "scripts": {
    "dev": "next dev",
    "build": "prisma generate && next build",
    "start": "next start",
    "lint": "eslint",
    "list-models": "ts-node scripts/list-all-models.ts",
    "ai-tools:setup": "node scripts/setup-ai-tools.js"
  }
}
```

### 3. Environment Variables

Add to your `.env.local`:

```bash
# Language Models
OPENAI_API_KEY=sk_...
OPENAI_ORG_ID=org_...
ANTHROPIC_API_KEY=sk-ant-...
GOOGLE_API_KEY=...
GEMINI_API_KEY=...
XAI_API_KEY=...

# Vision & Content Generation
GOOGLE_CLOUD_KEY=...
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...

# External Services
PIKA_API_KEY=...
RUNWAY_API_KEY=...

# File Processing
MAX_FILE_SIZE=52428800  # 50MB in bytes
ALLOWED_FILE_TYPES=image/jpeg,image/png,image/webp,application/pdf,video/mp4
```

### 4. File Structure

Verify these files exist in your project:

```
app/
├── services/
│   ├── modelRegistry.ts          ✓ NEW
│   ├── aiToolsService.ts          ✓ NEW
│   └── [existing services]
├── api/chronoread/
│   ├── models/
│   │   └── route.ts               ✓ NEW
│   ├── ai-tools/
│   │   └── route.ts               ✓ NEW
│   └── [existing endpoints]
components/
├── AIToolsMenu.tsx                ✓ NEW
├── FileAttachment.tsx             ✓ NEW
└── SearchBar.tsx                  ✓ UPDATED
scripts/
└── list-all-models.ts             ✓ NEW
```

### 5. Verify Installation

Run the model list script to verify everything is set up:

```bash
npm run list-models
```

Expected output:

```
🚀 AI Model Aggregator - OpenRouter Style

============================================================

🔄 Fetching models from all providers...

📌 OpenAI Models
   ✓ Found 5 models
📌 Anthropic/Claude Models
   ✓ Found 5 models
📌 Google/Gemini Models
   ✓ Found 5 models
📌 xAI/Grok Models
   ✓ Found 3 models
📌 Specialized Services
   ✓ Found 10 services

============================================================

📊 Summary:

OPENAI: 5 models
ANTHROPIC: 5 models
GOOGLE: 5 models
XAI: 3 models
SPECIALIZED: 10 services

✅ TOTAL: 28 models/services available

💡 Tip: Use aggregateAllModels() in your application to get all available models.
```

## Component Integration

### 1. SearchBar Component

The SearchBar has been updated with the AI Tools menu. It now:

- Shows a **+** button for AI tools menu
- Displays attached files
- Passes file data to search handler

Usage remains the same:

```typescript
<SearchBar onSearch={(query, category, file) => handleSearch(query, category, file)} />
```

### 2. Using AI Tools Menu

```typescript
import AIToolsMenu from '@/components/AIToolsMenu';

<AIToolsMenu
  onToolSelect={(tool, file) => {
    console.log(`Selected tool: ${tool}`);
    console.log(`File: ${file?.name}`);
    // Process file with selected tool
  }}
  isLoading={false}
/>
```

### 3. File Attachment Display

```typescript
import FileAttachment, { AttachedFile } from '@/components/FileAttachment';

const [files, setFiles] = useState<AttachedFile[]>([]);

<FileAttachment
  files={files}
  onRemove={(fileId) => setFiles(files.filter(f => f.id !== fileId))}
  onViewDetails={(file) => console.log(file)}
/>
```

## Advanced Setup

### 1. Custom Model Provider Integration

Add a custom provider to the model registry:

```typescript
// app/services/modelRegistry.ts

const CUSTOM_MODELS: AIModelProfile[] = [
  {
    id: "custom-model-1",
    provider: "specialized",
    name: "custom-model-1",
    displayName: "My Custom Model",
    description: "Custom model for specific use case",
    contextWindow: 8192,
    categories: ["text"],
    capabilities: ["text-generation"],
    costEffectiveness: "balanced",
    performance: "high",
  },
];

// Add to registry initialization
const allModels = [...TEXT_MODELS, ...CUSTOM_MODELS];
```

### 2. Custom AI Tool Integration

Extend the AI tools service:

```typescript
// app/services/aiToolsService.ts

export async function customTool(input: string): Promise<AIToolResponse> {
  // Your custom implementation
  return {
    success: true,
    data: { result: "custom output" },
    type: "image",
    processingTime: 100,
    provider: "custom",
  };
}
```

### 3. Advanced File Processing

```typescript
import { AttachedFile } from "@/components/FileAttachment";

async function processAttachedFile(file: AttachedFile) {
  const response = await fetch("/api/chronoread/ai-tools", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      type: file.tool,
      file: file.base64,
      fileName: file.name,
      mimeType: file.type,
      options: {
        // Tool-specific options
      },
    }),
  });

  return response.json();
}
```

## Troubleshooting

### Issue: "Module not found" errors

**Solution:**

```bash
npm install
# Clear Next.js cache
rm -rf .next
npm run dev
```

### Issue: API keys not recognized

**Solution:**

1. Verify keys in `.env.local` (not `.env`)
2. Restart dev server after changing env
3. Check key format and expiration

### Issue: File upload fails

**Solution:**

1. Check `MAX_FILE_SIZE` in env
2. Verify file type in `ALLOWED_FILE_TYPES`
3. Check browser console for errors

### Issue: Model endpoint returns 500 error

**Solution:**

```bash
# Check API keys are set
echo $OPENAI_API_KEY
echo $ANTHROPIC_API_KEY
echo $GOOGLE_API_KEY

# Verify models are properly registered
npm run list-models
```

## Testing the System

### 1. Test Model Registry

```typescript
// In your component or API route
import AIModelRegistry from "@/app/services/modelRegistry";

console.log("Available models:", AIModelRegistry.getSummary());
console.log("OpenAI models:", AIModelRegistry.getModelsByProvider("openai"));
```

### 2. Test AI Tools

```typescript
import { processAIToolRequest } from "@/app/services/aiToolsService";

// Test image generation
const result = await processAIToolRequest({
  type: "image",
  prompt: "Test image",
});

console.log("Image generation:", result);
```

### 3. Test API Endpoints

```bash
# Get models
curl http://localhost:3000/api/chronoread/models

# Get OpenAI models only
curl http://localhost:3000/api/chronoread/models?provider=openai

# Find best model
curl -X POST http://localhost:3000/api/chronoread/models \
  -H "Content-Type: application/json" \
  -d '{"action":"find-best","criteria":{"category":"text","priority":"speed"}}'
```

## Performance Optimization

### 1. Model Caching

Models are cached in memory at startup. For large deployments:

```typescript
// app/services/modelRegistry.ts
const MODEL_CACHE_TTL = 1 * 60 * 60 * 1000; // 1 hour

// Implement cache invalidation if needed
```

### 2. File Upload Streaming

```typescript
// For large files, use streaming
async function uploadFileStream(file: File) {
  const formData = new FormData();
  formData.append("file", file);

  const response = await fetch("/api/chronoread/ai-tools", {
    method: "POST",
    body: formData, // No manual base64 conversion
  });

  return response.json();
}
```

## Security Considerations

1. **API Key Management**: Store keys securely in environment variables
2. **File Validation**: Always validate file types and sizes
3. **Request Rate Limiting**: Implement rate limiting on endpoints
4. **CORS**: Configure appropriate CORS policies
5. **File Scanning**: Consider adding virus scanning for uploads

## Support & Debugging

Enable debug logging:

```bash
# Enable Next.js debug
NODE_DEBUG=* npm run dev

# Check logs in your terminal for detailed errors
```

For model-specific issues, check provider documentation:

- [OpenAI API Docs](https://platform.openai.com/docs)
- [Anthropic Docs](https://console.anthropic.com/docs)
- [Google AI Docs](https://ai.google.dev/docs)

## Next Steps

1. ✅ Install dependencies
2. ✅ Set up environment variables
3. ✅ Verify file structure
4. ✅ Run `npm run list-models` to verify
5. ✅ Start dev server: `npm run dev`
6. ✅ Test AI Tools menu in UI
7. ✅ Test file uploads
8. ✅ Integrate with your workflows

For detailed usage examples, see `AI_TOOLS_DOCUMENTATION.md`
