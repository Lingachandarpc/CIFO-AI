# AI Model Management & Tools System

Comprehensive AI model aggregation and multi-service integration system for Chronoread.

## Overview

This system provides:

1. **Model Aggregation** - Access to 30+ models across 5 providers (OpenAI, Anthropic, Google, xAI, Specialized)
2. **AI Tools** - Image generation, video creation, OCR, document processing
3. **File Attachments** - Upload and process files with AI tools
4. **Cost Optimization** - Find best models by cost, speed, or quality
5. **Tool Menu** - Integrated UI for accessing all services

## Architecture

### Services

#### Model Registry Service (`modelRegistry.ts`)

Central registry for all AI models with smart selection capabilities.

```typescript
import AIModelRegistry from '@/app/services/modelRegistry';

// Get all models
const allModels = AIModelRegistry.getAllModels();

// Filter by provider
const openaiModels = AIModelRegistry.getModelsByProvider('openai');

// Filter by category (text, vision, image, video, audio, ocr)
const textModels = AIModelRegistry.getModelsByCategory('text');

// Find best model by criteria
const bestModel = AIModelRegistry.findBestModel({
  category: 'text',
  priority: 'speed' // or 'quality' or 'cost'
});

// Get summary
const summary = AIModelRegistry.getSummary();
```

#### AI Tools Service (`aiToolsService.ts`)

Handles image generation, video creation, OCR, and document processing.

```typescript
import { processAIToolRequest } from '@/app/services/aiToolsService';

// Generate image
const imageResult = await processAIToolRequest({
  type: 'image',
  prompt: 'A sunset over mountains',
  options: {
    size: '1024x1024',
    quality: 'hd',
    style: 'vivid',
  },
});

// Generate video
const videoResult = await processAIToolRequest({
  type: 'video',
  prompt: 'A car driving through a scenic road',
  options: {
    duration: 4,
    resolution: '1080p',
  },
});

// Perform OCR
const ocrResult = await processAIToolRequest({
  type: 'ocr',
  file: imageBuffer,
  options: {
    language: 'eng',
  },
});

// Generate document
const docResult = await processAIToolRequest({
  type: 'document',
  prompt: 'Your document content here',
  options: {
    format: 'pdf',
    title: 'My Document',
    author: 'John Doe',
  },
});
```

### API Routes

#### `/api/chronoread/models`

Retrieve and query available AI models.

**GET Parameters:**
- `provider`: Filter by provider (openai, anthropic, google, xai, specialized)
- `category`: Filter by category (text, vision, image, video, audio, ocr)
- `q`: Search query (searches name, displayName, description)

**Example:**
```bash
# Get all GPT models
GET /api/chronoread/models?provider=openai

# Get all image generation models
GET /api/chronoread/models?category=image

# Search for Claude models
GET /api/chronoread/models?q=claude
```

**POST Actions:**

```bash
# Get a specific model
POST /api/chronoread/models
{
  "action": "get",
  "modelId": "gpt-4-turbo"
}

# Find best model by criteria
POST /api/chronoread/models
{
  "action": "find-best",
  "criteria": {
    "category": "text",
    "priority": "speed"  // or "quality" or "cost"
  }
}

# Get summary
POST /api/chronoread/models
{
  "action": "summary"
}
```

#### `/api/chronoread/ai-tools`

Process various AI tool requests.

**POST Request:**
```json
{
  "type": "image",
  "prompt": "string",
  "file": "base64 string (optional)",
  "fileName": "string (optional)",
  "mimeType": "string (optional)",
  "options": {
    // Tool-specific options
  }
}
```

**Response:**
```json
{
  "success": true,
  "data": {},
  "type": "image|video|ocr|document|dashboard",
  "processingTime": 1234,
  "provider": "openai"
}
```

## Available Models

### Text Generation (10 models)

**Budget-Friendly:**
- `gpt-3.5-turbo` - OpenAI (0.5-1.5 $/MTok)
- `claude-3-haiku` - Anthropic (0.25-1.25 $/MTok)
- `gemini-1.5-flash` - Google (0.075-0.3 $/MTok)

**Balanced:**
- `gpt-4` - OpenAI (30-60 $/MTok)
- `claude-3-sonnet` - Anthropic (3-15 $/MTok)
- `grok-1` - xAI (5-15 $/MTok)

**Premium:**
- `gpt-4-turbo` - OpenAI (10-30 $/MTok)
- `claude-3-opus` - Anthropic (15-75 $/MTok)
- `gemini-1.5-pro` - Google (3.5-10.5 $/MTok)

### Vision/Image (3 models)

- `dall-e-3` - OpenAI (premium-tier)
- `dall-e-2` - OpenAI (balanced)
- `stable-diffusion-3` - Stability AI (budget)

### Audio (1 model)

- `whisper-1` - OpenAI (speech-to-text)

### OCR (2 models)

- `google-vision-ocr` - Google (cloud-based)
- `tesseract-ocr` - Open-source (local)

### Video (2 models)

- `pika-1.0` - Pika (balanced)
- `runway-gen3` - Runway (premium)

### Embeddings (2 models)

- `text-embedding-3-large` - OpenAI (high accuracy)
- `text-embedding-3-small` - OpenAI (fast)

## UI Components

### AIToolsMenu

Dropdown menu for selecting AI tools and uploading files.

```typescript
import AIToolsMenu from '@/components/AIToolsMenu';

<AIToolsMenu
  onToolSelect={(tool, file) => {
    // Handle tool selection with optional file
  }}
  isLoading={false}
/>
```

### FileAttachment

Display and manage attached files.

```typescript
import FileAttachment from '@/components/FileAttachment';

<FileAttachment
  files={attachedFiles}
  onRemove={(fileId) => {}}
  onViewDetails={(file) => {}}
  readOnly={false}
/>
```

## Environment Variables

```bash
# OpenAI
OPENAI_API_KEY=sk_...
OPENAI_ORG_ID=...

# Anthropic
ANTHROPIC_API_KEY=sk-ant-...

# Google
GOOGLE_API_KEY=...
GOOGLE_CLOUD_KEY=...
GEMINI_API_KEY=...

# xAI
XAI_API_KEY=...

# External Services (Optional)
PIKA_API_KEY=...
RUNWAY_API_KEY=...
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
```

## Scripts

### List All Models

```bash
npm run ts-node scripts/list-all-models.ts
```

This generates a comprehensive list of all available models across providers with pricing and capabilities.

## Usage Examples

### Select Best Model for Task

```typescript
import AIModelRegistry from '@/app/services/modelRegistry';

// For fast response (coding, chatbot):
const fastModel = AIModelRegistry.findBestModel({
  category: 'text',
  priority: 'speed',
});
// Result: Claude 3 Haiku or Gemini 1.5 Flash

// For highest quality (reasoning, analysis):
const qualityModel = AIModelRegistry.findBestModel({
  category: 'text',
  priority: 'quality',
});
// Result: Claude 3 Opus or GPT-4 Turbo

// For cost-effective solution:
const budgetModel = AIModelRegistry.findBestModel({
  category: 'text',
  priority: 'cost',
});
// Result: Gemini 1.5 Flash or Claude 3 Haiku
```

### Generate Image with Fallback

```typescript
import { processAIToolRequest } from '@/app/services/aiToolsService';

const result = await processAIToolRequest({
  type: 'image',
  prompt: 'Beautiful sunset',
  options: {
    quality: 'hd',
    size: '1024x1024',
  },
});

if (result.success) {
  console.log(result.data.images);
} else {
  console.error('Image generation failed:', result.error);
}
```

### OCR Document

```typescript
const file = event.target.files[0];
const reader = new FileReader();

reader.onload = async (e) => {
  const base64 = e.target?.result as string;
  
  const result = await processAIToolRequest({
    type: 'ocr',
    file: base64,
    options: { language: 'eng' },
  });

  console.log('Extracted text:', result.data.fullText);
};

reader.readAsDataURL(file);
```

## Integration with Existing Features

The file attachment system integrates seamlessly with the chat interface:

1. User clicks **+** button in search field
2. Selects AI tool (image, video, OCR, document)
3. Uploads file if needed
4. File appears in attachment widget
5. Query is submitted with attached file
6. AI processes both query and file
7. Results appear in response

## Cost Optimization

The system includes cost-effectiveness tracking:

- **Budget**: Low-cost models (< $1 per 1M tokens)
- **Balanced**: Mid-range models ($1-10 per 1M tokens)
- **Premium**: High-performance models (> $10 per 1M tokens)

Use the finder to automatically select the most cost-effective model for your needs.

## Performance Tiers

- **Low**: Specialized low-power models
- **Medium**: General-purpose models
- **High**: Advanced models with better reasoning
- **Ultra**: Cutting-edge models with best capabilities

## Future Enhancements

- [ ] Model usage analytics dashboard
- [ ] Cost tracking and budget alerts
- [ ] Multi-model comparison tool
- [ ] Custom model fine-tuning support
- [ ] Model inference optimization
- [ ] Advanced file processing workflows
- [ ] Batch processing for files
- [ ] Model performance benchmarking

## Troubleshooting

### No models found

Ensure API keys are set in environment variables. The system will return available models for configured providers only.

### File upload fails

Check file size limits and accepted MIME types for each tool:
- Image: < 20MB, image/*
- Video: < 100MB, video/*
- OCR: < 50MB, image/* or PDF
- Document: < 10MB, any text format

### Tool processing timeout

Large files or complex operations may timeout. Consider:
- Reducing file size
- Using smaller input batches
- Selecting faster models

## Support

For issues or questions, refer to the main documentation or create an issue in the repository.
