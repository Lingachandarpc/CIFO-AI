# Middleware Architecture Documentation

## Overview

The middleware layer is a **centralized orchestration service** that sits between user queries and AI models, handling web search, context enrichment, and response combination. This ensures all AI models receive the same enriched context while maintaining their unique response styles.

## Architecture Flow

```
┌─────────────┐
│ User Query  │
└──────┬──────┘
       │
       ▼
┌─────────────────────────────────────────────────────────┐
│          MIDDLEWARE LAYER (middlewareService.ts)         │
│                                                          │
│  ┌──────────────────────────────────────────┐           │
│  │ 1. Pre-Processing                        │           │
│  │    • Extract user context (profile)      │           │
│  │    • Load mood settings                  │           │
│  │    • Enrich query with context           │           │
│  └──────────────────────────────────────────┘           │
│                    │                                     │
│                    ▼                                     │
│  ┌──────────────────────────────────────────┐           │
│  │ 2. Web Search (Tavily)                   │           │
│  │    • Fetch real-time results             │           │
│  │    • Extract: title, URL, content        │           │
│  │    • Score and rank results              │           │
│  └──────────────────────────────────────────┘           │
│                    │                                     │
│                    ▼                                     │
│  ┌──────────────────────────────────────────┐           │
│  │ 3. Build Middleware Context              │           │
│  │    • Original query                      │           │
│  │    • Enriched query                      │           │
│  │    • User context (profile + mood)       │           │
│  │    • Web results array                   │           │
│  │    • Timestamp                           │           │
│  └──────────────────────────────────────────┘           │
└────────────────────┬────────────────────────────────────┘
                     │
                     ▼
       ┌─────────────────────────────┐
       │  AI MODEL ADAPTER           │
       │  (aiAdapters.ts)            │
       │                             │
       │  • geminiAdapter()          │
       │  • claudeAdapter()          │
       │  • xaiAdapter()             │
       │  • openaiAdapter()          │
       └─────────────┬───────────────┘
                     │
                     ▼
       ┌─────────────────────────────┐
       │  AI MODEL SERVICE           │
       │                             │
       │  • geminiService.ts         │
       │  • claudeService.ts         │
       │  • xaiService.ts            │
       │  • OpenAI SDK               │
       └─────────────┬───────────────┘
                     │
                     ▼
       ┌─────────────────────────────┐
       │  AI Response                │
       │  (Raw Narration)            │
       └─────────────┬───────────────┘
                     │
                     ▼
┌────────────────────────────────────────────────────────┐
│          MIDDLEWARE LAYER (Post-Processing)            │
│                                                        │
│  ┌──────────────────────────────────────────┐         │
│  │ 4. Response Combination                  │         │
│  │    • AI-generated narration              │         │
│  │    • + Web sources as citations          │         │
│  │    • + Metadata (processing time, etc)   │         │
│  └──────────────────────────────────────────┘         │
└─────────────────────┬──────────────────────────────────┘
                      │
                      ▼
        ┌─────────────────────────────┐
        │  Enhanced Response          │
        │  • narration (combined)     │
        │  • webSources[]             │
        │  • contextApplied{}         │
        │  • metadata{}               │
        └─────────────────────────────┘
```

## Key Components

### 1. **middlewareService.ts** - Core Orchestrator

**Responsibilities:**

- Fetch Tavily web search results
- Enrich queries with user context (profile, mood, learning history)
- Build middleware context object
- Coordinate AI model calls
- Combine AI responses with web sources
- Track user learning and engagement

**Key Functions:**

```typescript
processQueryWithMiddleware(
  query: string,
  aiModelFunction: (enrichedQuery: string, context: MiddlewareContext) => Promise<string>,
  options: {
    narrationTime: number;
    narrationType: string;
    language: string;
    interactionMode: 'read' | 'listen';
    enableWebSearch: boolean;
    userContext?: UserMindContext;
  }
): Promise<EnhancedResponse>
```

**Data Structures:**

```typescript
interface UserMindContext {
  profile?: {
    name?: string;
    age?: number | null;
    location?: string;
    interests?: string;
    pulse?: string;
    bio?: string;
  };
  mood?: {
    current: "curious" | "focused" | "creative" | "analytical" | "casual";
    energy: "low" | "medium" | "high";
    preferences: string[];
  };
  recentQueries?: string[];
  learningHistory?: Array<{
    topic: string;
    timestamp: Date;
    engagement: number;
  }>;
}

interface EnhancedResponse {
  narration: string; // Combined AI + web sources
  modelUsed: string; // AI model name
  webSources?: Array<{
    // Top 3 web sources
    title: string;
    url: string;
    snippet: string;
  }>;
  contextApplied: {
    // What context was used
    userProfile: boolean;
    mood: boolean;
    webSearch: boolean;
  };
  metadata: {
    // Performance metrics
    processingTime: number;
    searchResultsCount: number;
    aiTokensUsed?: number;
  };
}
```

### 2. **aiAdapters.ts** - Model Integration Layer

**Purpose:** Wrap each AI service to work seamlessly with the middleware pattern.

**Key Adapters:**

- `geminiAdapter()` - Google Gemini 2.5 Flash
- `claudeAdapter()` - Anthropic Claude Sonnet
- `xaiAdapter()` - Grok (xAI)
- `openaiAdapter()` - GPT-4o-mini

Each adapter:

1. Receives enriched query + middleware context
2. Formats context for specific AI model
3. Calls AI service (with `enableWebSearch: false` to avoid duplication)
4. Returns raw narration text

### 3. **UserMindStorage** - Future-Ready State Management

**Purpose:** Persistent storage for user mood, learning history, and preferences.

```typescript
class UserMindStorage {
  async getUserContext(userId: string): Promise<UserMindContext>;
  async updateUserContext(
    userId: string,
    context: Partial<UserMindContext>,
  ): Promise<void>;
  async trackLearning(
    userId: string,
    topic: string,
    engagement: number,
  ): Promise<void>;
}
```

**Future Features:**

- 🧠 **Mood Detection**: Analyze query patterns to infer user mood
- 📚 **Learning Paths**: Track topics over time, suggest related content
- 🎯 **Personalization**: Adapt narration style based on engagement history
- 💬 **Conversation Memory**: Maintain context across sessions

## Why Middleware Architecture?

### Problem with Old Approach

Each AI service duplicated:

- Tavily search logic (4x copies)
- Context enrichment (4x copies)
- Response formatting (inconsistent)

Result: **All models gave similar responses** because they all received identical Tavily-enriched prompts.

### Solution: Middleware Layer

1. **Centralized Tavily**: One source of truth for web search
2. **Post-Processing Combination**: AI generates narrative independently, middleware adds web sources as citations
3. **Consistent Context**: All models receive same enriched context, but maintain unique styles
4. **Future-Proof**: Easy to add mood, mind storage, personalization without touching AI services

## Response Difference Example

### Old Approach (Tavily in prompt):

```
Query: "Latest AI breakthroughs"

OpenAI Response: "Based on recent developments in February 2026, OpenAI
released GPT-5 with 10T parameters... [Tavily content mixed in]"

Gemini Response: "According to latest sources from February 2026, OpenAI
released GPT-5 with 10T parameters... [Same Tavily content]"

Result: Nearly identical responses ❌
```

### New Middleware Approach:

```
Query: "Latest AI breakthroughs"

OpenAI Response: "Artificial intelligence has reached remarkable milestones
in reasoning and multimodal understanding. The latest generation of models
demonstrates unprecedented capabilities in complex problem-solving..."

+ Middleware adds:
---
📰 Latest Web Sources (February 2026)
[1] OpenAI Unveils GPT-5 - techcrunch.com
[2] Google's Gemini 3 Preview Released - theverge.com
[3] Anthropic's Claude 4 Benchmarks - arstechnica.com

Gemini Response: "The evolution of AI systems has accelerated remarkably.
Modern frontier models excel at multi-step reasoning, combining vision,
language, and structured data into cohesive outputs..."

+ Same web sources appended

Result: Distinct AI narratives + consistent source citations ✅
```

## API Route Integration

### Updated `/api/chronoread/ai/route.ts`

```typescript
export async function POST(req: Request) {
  // 1. Extract parameters
  const { query, aiModel, enableWebSearch, userContext, ... } = await req.json();

  // 2. Build user mind context
  const userMindContext: UserMindContext = {
    profile: userContext?.profile,
    mood: userContext?.mood || { current: "curious", energy: "medium", preferences: [] },
    recentQueries: userContext?.recentQueries || [],
    learningHistory: userContext?.learningHistory || [],
  };

  // 3. Select AI adapter
  const selectedAdapter = /* geminiAdapter | claudeAdapter | xaiAdapter | openaiAdapter */;

  // 4. Process through middleware
  const enhancedResponse = await processQueryWithMiddleware(
    query,
    (enrichedQuery, context) => selectedAdapter(enrichedQuery, context, options),
    { narrationTime, narrationType, language, interactionMode, enableWebSearch, userContext: userMindContext }
  );

  // 5. Return enhanced response
  return NextResponse.json(enhancedResponse);
}
```

## Future Enhancements

### Phase 1: Mood Detection (Current)

- ✅ Mood context structure defined
- ⚪ Auto-detect mood from query tone
- ⚪ Adjust narration style based on mood

### Phase 2: Mind Storage (Database Integration)

- ⚪ Store user learning history in Prisma
- ⚪ Track engagement metrics
- ⚪ Build user knowledge graph

### Phase 3: Personalization

- ⚪ Recommend topics based on history
- ⚪ Adaptive narration length/complexity
- ⚪ Multi-turn conversation awareness

### Phase 4: Advanced Features

- ⚪ Real-time fact-checking (Tavily + AI verification)
- ⚪ Multi-source synthesis (combine multiple web results)
- ⚪ Audio tone modulation based on mood
- ⚪ Learning path visualization

## Migration Guide

### If You Need to Add a New AI Model

1. **Create Service** (e.g., `app/services/newModelService.ts`)

   ```typescript
   export async function generateNarrative(query: string, ...): Promise<string>
   ```

2. **Create Adapter** in `app/services/aiAdapters.ts`

   ```typescript
   export async function newModelAdapter(
     enrichedQuery: string,
     context: MiddlewareContext,
     options: {...}
   ): Promise<string> {
     // Call your service with context.query, context.userContext, etc.
     // Return raw narration
   }
   ```

3. **Add to Route** in `app/api/chronoread/ai/route.ts`
   ```typescript
   case "new-model":
     selectedAdapter = newModelAdapter;
     modelName = "new-model";
     break;
   ```

### If You Need to Add Mood/Context Features

1. **Update Types** in `middlewareService.ts`

   ```typescript
   interface UserMindContext {
     // Add new fields here
   }
   ```

2. **Update `enrichQueryWithContext()`** in `middlewareService.ts`

   ```typescript
   function enrichQueryWithContext(
     query: string,
     userContext: UserMindContext,
   ): string {
     // Add your enrichment logic
   }
   ```

3. **Update Database Schema** (if persisting)
   ```prisma
   model UserContext {
     // Add fields to prisma/schema.prisma
   }
   ```

## Testing

### Test Middleware Independently

```bash
# Test script coming soon...
node scripts/test-middleware.js
```

### Compare Model Responses

Visit `/test-models` (demo page coming soon) to see side-by-side comparison of:

- OpenAI (GPT-4o-mini)
- Gemini (2.5 Flash)
- Claude (Sonnet)
- xAI (Grok)

All using the same middleware context!

## Performance Considerations

- **Tavily API**: ~500-1000ms per query
- **AI Generation**: 2-15s depending on model and length
- **Middleware Overhead**: <100ms
- **Total**: Similar to old approach, but with better architecture

## Conclusion

The middleware layer provides:

- ✅ Centralized web search (one Tavily call)
- ✅ Consistent context enrichment
- ✅ Distinct AI responses with shared citations
- ✅ Future-ready for mood/mind features
- ✅ Clean separation of concerns
- ✅ Easy to test and maintain

---

**Next Steps:**

1. Test with all 4 AI models
2. Verify web sources appear in responses
3. Implement mood detection logic
4. Add database persistence for UserMindStorage
5. Create visual comparison UI
