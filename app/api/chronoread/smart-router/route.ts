export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { classifyQuery } from "../../../services/queryClassifier";
import {
  routeQuery,
  formatRoutingLog,
  resolveRoutingToLegacy,
} from "../../../services/modelRouter";
import { buildOptimizedPrompt } from "../../../services/promptTemplateEngine";
import type { QueryClassification } from "../../../services/queryClassifier";
import type { RoutingDecision } from "../../../services/modelRouter";
import type { PromptTemplate, PromptContext } from "../../../services/promptTemplateEngine";

/**
 * POST /api/chronoread/smart-router
 *
 * Intelligent model routing endpoint. Accepts a query with optional metadata
 * and returns the classification, routing decision, and optimized prompt template.
 *
 * This can be used in two ways:
 * 1. **Advisory mode**: Client sends query, gets back routing recommendation + prompt
 * 2. **Pre-flight mode**: Called before the main /ai endpoint to determine model selection
 */
export async function POST(req: Request) {
  try {
    const {
      query,
      attachments,
      chatHistory,
      userContext,
      language,
      narrationType,
      interactionMode,
      aiModel,
      selectedModel,
    } = await req.json() as {
      query: string;
      attachments?: Array<{ name: string; type: string; size?: number }>;
      chatHistory?: Array<{ role: string; content: string }>;
      userContext?: {
        profile?: {
          name?: string;
          age?: number | null;
          location?: string;
          interests?: string;
          pulse?: string;
          bio?: string;
        };
        mood?: { current: string; energy: string };
      };
      language?: string;
      narrationType?: string;
      interactionMode?: 'read' | 'listen';
      aiModel?: string;
      selectedModel?: string;
    };

    if (!query || typeof query !== 'string') {
      return NextResponse.json(
        { error: 'Query is required' },
        { status: 400 }
      );
    }

    // ─── Step 1: Classify the query ──────────────────────────────
    const classification: QueryClassification = classifyQuery(query, {
      attachments,
      chatHistory,
    });

    // ─── Step 2: Route to optimal model ──────────────────────────
    const routing: RoutingDecision = routeQuery(classification, {
      aiModel,
      selectedModel,
    });

    // Log the decision for debugging
    console.log(formatRoutingLog(routing));

    // ─── Step 3: Build optimized prompt template ─────────────────
    const promptContext: PromptContext = {
      userProfile: userContext?.profile,
      mood: userContext?.mood,
      chatHistory,
      language,
      narrationType,
      interactionMode,
      targetProvider: routing.provider,
    };

    const promptTemplate: PromptTemplate = buildOptimizedPrompt(
      classification,
      promptContext
    );

    // ─── Step 4: Generate legacy-compatible resolution ───────────
    const legacyResolution = resolveRoutingToLegacy(routing);

    // ─── Return comprehensive routing response ───────────────────
    return NextResponse.json({
      // Classification results
      classification: {
        complexity: classification.complexity,
        primaryIntent: classification.primaryIntent,
        secondaryIntents: classification.secondaryIntents,
        domain: classification.domain,
        attachments: classification.attachments.map(a => ({
          name: a.name,
          type: a.type,
          requiresVision: a.requiresVision,
          requiresOCR: a.requiresOCR,
        })),
        requiresRealTime: classification.requiresRealTime,
        requiresMultiModal: classification.requiresMultiModal,
        isFollowUp: classification.isFollowUp,
        requiresLongContext: classification.requiresLongContext,
        confidence: classification.confidence,
        signals: {
          wordCount: classification.signals.wordCount,
          sentenceCount: classification.signals.sentenceCount,
          hasCodeBlock: classification.signals.hasCodeBlock,
          hasTechnicalTerms: classification.signals.hasTechnicalTerms,
          hasAmbiguity: classification.signals.hasAmbiguity,
          hasMultipleTopics: classification.signals.hasMultipleTopics,
          languageComplexity: classification.signals.languageComplexity,
        },
      },

      // Routing decision
      routing: {
        selectedModel: {
          id: routing.selected.id,
          provider: routing.provider,
          model: routing.modelId,
          displayName: routing.selected.displayName,
          score: routing.selected.score,
          reasoning: routing.selected.reasoning,
          scoreBreakdown: routing.selected.scoreBreakdown,
        },
        alternatives: routing.alternatives.map(a => ({
          id: a.id,
          provider: a.provider,
          displayName: a.displayName,
          score: a.score,
          reasoning: a.reasoning,
        })),
        adapterName: routing.adapterName,
        confidence: routing.confidence,
        explanation: routing.explanation,
      },

      // Optimized prompt template
      prompt: {
        systemPrompt: promptTemplate.systemPrompt,
        userPrompt: promptTemplate.userPrompt,
        reasoningInstructions: promptTemplate.reasoningInstructions,
        formatGuidance: promptTemplate.formatGuidance,
        suggestedMaxTokens: promptTemplate.suggestedMaxTokens,
        suggestedTemperature: promptTemplate.suggestedTemperature,
        metadata: promptTemplate.metadata,
      },

      // Legacy-compatible resolution (for backward compat with /ai route)
      legacyResolution,
    });
  } catch (error) {
    console.error('❌ Smart router error:', error);
    return NextResponse.json(
      { error: 'Smart routing failed' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/chronoread/smart-router
 *
 * Returns the available model profiles and routing capabilities.
 */
export async function GET() {
  return NextResponse.json({
    description: 'Chronoread Smart Model Router — Intelligent AI model selection based on query classification',
    version: '1.0.0',
    capabilities: {
      queryClassification: {
        complexityLevels: ['simple', 'moderate', 'complex', 'cluttered'],
        intentTypes: [
          'factual', 'analytical', 'creative', 'code', 'comparison',
          'conversational', 'real_time', 'multi_modal', 'instructional',
          'mathematical', 'translation', 'summarization',
        ],
        domains: [
          'technology', 'science', 'finance', 'health', 'education',
          'creative_writing', 'programming', 'business', 'history',
          'psychology', 'mathematics', 'law', 'news_current_events',
          'entertainment', 'general',
        ],
        attachmentTypes: ['image', 'document', 'code_file', 'spreadsheet', 'audio', 'video', 'pdf'],
      },
      modelRouting: {
        scoringDimensions: ['capabilityMatch', 'qualityFit', 'costEfficiency', 'speedScore', 'contextFit'],
        maxScore: 100,
        fallbackSupported: true,
      },
      promptOptimization: {
        complexityAdaptive: true,
        intentSpecific: true,
        providerOptimized: true,
        attachmentAware: true,
      },
    },
    usage: {
      endpoint: 'POST /api/chronoread/smart-router',
      body: {
        query: 'string (required)',
        attachments: 'Array<{name, type, size}> (optional)',
        chatHistory: 'Array<{role, content}> (optional)',
        userContext: '{ profile, mood } (optional)',
        language: 'string (optional)',
        narrationType: 'string (optional)',
        interactionMode: 'read | listen (optional)',
        aiModel: 'auto | openai | claude-sonnet | xai | gemini (optional)',
        selectedModel: 'string (optional, specific model ID)',
      },
    },
  });
}
