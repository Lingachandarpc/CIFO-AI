/**
 * AI Model Router / Selector Engine
 * Intelligent model selection based on query classification, available API keys,
 * model capabilities, cost considerations, and provider health.
 *
 * Decision Matrix:
 *   QueryClassification + Available Models + User Preferences
 *     → Weighted scoring across dimensions (capability, cost, speed, context-fit)
 *     → Ranked model candidates
 *     → Final selection with fallback chain
 *
 * Selection Priorities:
 *   1. Capability match (can the model handle this query type?)
 *   2. Quality fit (is this model's strength aligned with the query?)
 *   3. Cost efficiency (don't use premium models for simple queries)
 *   4. Speed (prefer faster models for simple/conversational queries)
 *   5. Context window (long queries/history need large context models)
 *   6. Provider availability (API key present and provider healthy)
 */

import {
  QueryClassification,
  QueryComplexity,
  QueryIntent,
  QueryDomain,
} from './queryClassifier';

// ============================================================================
// Types
// ============================================================================

export type ProviderName = 'openai' | 'anthropic' | 'google' | 'xai';

export interface ModelCandidate {
  id: string;
  provider: ProviderName;
  model: string;
  displayName: string;
  /** Overall suitability score (0-100) */
  score: number;
  /** Why this model was selected/scored this way */
  reasoning: string;
  /** Breakdown of scoring dimensions */
  scoreBreakdown: {
    capabilityMatch: number;   // 0-30
    qualityFit: number;        // 0-25
    costEfficiency: number;    // 0-20
    speedScore: number;        // 0-15
    contextFit: number;        // 0-10
  };
}

export interface RoutingDecision {
  /** The selected model */
  selected: ModelCandidate;
  /** Ranked alternatives (for fallback) */
  alternatives: ModelCandidate[];
  /** Classification that drove the decision */
  classification: QueryClassification;
  /** Provider to use */
  provider: ProviderName;
  /** Specific model identifier for the provider */
  modelId: string;
  /** Adapter function name to use */
  adapterName: 'openaiAdapter' | 'claudeAdapter' | 'geminiAdapter' | 'xaiAdapter';
  /** Decision confidence (0-1) */
  confidence: number;
  /** Human-readable explanation of the routing decision */
  explanation: string;
}

// ============================================================================
// Model Profiles (Routing Knowledge Base)
// ============================================================================

interface ModelProfile {
  id: string;
  provider: ProviderName;
  model: string;
  displayName: string;
  /** API key environment variable name */
  envKey: string;
  /** Maximum context window in tokens */
  contextWindow: number;
  /** Relative cost tier (1=cheap, 5=expensive) */
  costTier: 1 | 2 | 3 | 4 | 5;
  /** Relative speed tier (1=slow, 5=fast) */
  speedTier: 1 | 2 | 3 | 4 | 5;
  /** Quality tier (1=basic, 5=best) */
  qualityTier: 1 | 2 | 3 | 4 | 5;
  /** What this model excels at */
  strengths: QueryIntent[];
  /** Domains this model is particularly strong in */
  strongDomains: QueryDomain[];
  /** Complexity levels this model handles well */
  bestForComplexity: QueryComplexity[];
  /** Special capabilities */
  capabilities: {
    vision: boolean;
    realTime: boolean;
    longContext: boolean;
    code: boolean;
    reasoning: boolean;
    creative: boolean;
    multiModal: boolean;
  };
}

const MODEL_PROFILES: ModelProfile[] = [
  // ─── OpenAI ────────────────────────────────────────────────────
  {
    id: 'gpt-4-turbo',
    provider: 'openai',
    model: 'gpt-4-turbo',
    displayName: 'GPT-4 Turbo',
    envKey: 'OPENAI_API_KEY',
    contextWindow: 128000,
    costTier: 4,
    speedTier: 3,
    qualityTier: 5,
    strengths: [QueryIntent.ANALYTICAL, QueryIntent.CODE, QueryIntent.INSTRUCTIONAL, QueryIntent.MULTI_MODAL],
    strongDomains: [QueryDomain.PROGRAMMING, QueryDomain.TECHNOLOGY, QueryDomain.SCIENCE, QueryDomain.BUSINESS],
    bestForComplexity: [QueryComplexity.COMPLEX, QueryComplexity.MODERATE],
    capabilities: { vision: true, realTime: false, longContext: true, code: true, reasoning: true, creative: true, multiModal: true },
  },
  {
    id: 'gpt-4o-mini',
    provider: 'openai',
    model: 'gpt-4o-mini',
    displayName: 'GPT-4o Mini',
    envKey: 'OPENAI_API_KEY',
    contextWindow: 128000,
    costTier: 2,
    speedTier: 5,
    qualityTier: 4,
    strengths: [QueryIntent.FACTUAL, QueryIntent.CONVERSATIONAL, QueryIntent.INSTRUCTIONAL, QueryIntent.CODE],
    strongDomains: [QueryDomain.GENERAL, QueryDomain.PROGRAMMING, QueryDomain.TECHNOLOGY],
    bestForComplexity: [QueryComplexity.SIMPLE, QueryComplexity.MODERATE],
    capabilities: { vision: true, realTime: false, longContext: true, code: true, reasoning: true, creative: true, multiModal: true },
  },
  {
    id: 'gpt-3.5-turbo',
    provider: 'openai',
    model: 'gpt-3.5-turbo',
    displayName: 'GPT-3.5 Turbo',
    envKey: 'OPENAI_API_KEY',
    contextWindow: 4096,
    costTier: 1,
    speedTier: 5,
    qualityTier: 2,
    strengths: [QueryIntent.FACTUAL, QueryIntent.CONVERSATIONAL, QueryIntent.TRANSLATION],
    strongDomains: [QueryDomain.GENERAL],
    bestForComplexity: [QueryComplexity.SIMPLE],
    capabilities: { vision: false, realTime: false, longContext: false, code: true, reasoning: false, creative: false, multiModal: false },
  },

  // ─── Anthropic Claude ──────────────────────────────────────────
  {
    id: 'claude-sonnet',
    provider: 'anthropic',
    model: 'claude-sonnet-4-20250514',
    displayName: 'Claude Sonnet 4',
    envKey: 'ANTHROPIC_API_KEY',
    contextWindow: 200000,
    costTier: 3,
    speedTier: 4,
    qualityTier: 5,
    strengths: [QueryIntent.ANALYTICAL, QueryIntent.CODE, QueryIntent.CREATIVE, QueryIntent.SUMMARIZATION, QueryIntent.INSTRUCTIONAL],
    strongDomains: [QueryDomain.PROGRAMMING, QueryDomain.CREATIVE_WRITING, QueryDomain.SCIENCE, QueryDomain.EDUCATION],
    bestForComplexity: [QueryComplexity.COMPLEX, QueryComplexity.CLUTTERED, QueryComplexity.MODERATE],
    capabilities: { vision: true, realTime: false, longContext: true, code: true, reasoning: true, creative: true, multiModal: true },
  },
  {
    id: 'claude-opus',
    provider: 'anthropic',
    model: 'claude-3-opus-20240229',
    displayName: 'Claude 3 Opus',
    envKey: 'ANTHROPIC_API_KEY',
    contextWindow: 200000,
    costTier: 5,
    speedTier: 2,
    qualityTier: 5,
    strengths: [QueryIntent.ANALYTICAL, QueryIntent.CREATIVE, QueryIntent.CODE, QueryIntent.SUMMARIZATION],
    strongDomains: [QueryDomain.SCIENCE, QueryDomain.PROGRAMMING, QueryDomain.CREATIVE_WRITING, QueryDomain.LAW],
    bestForComplexity: [QueryComplexity.COMPLEX],
    capabilities: { vision: true, realTime: false, longContext: true, code: true, reasoning: true, creative: true, multiModal: true },
  },
  {
    id: 'claude-haiku',
    provider: 'anthropic',
    model: 'claude-3-haiku-20240307',
    displayName: 'Claude 3 Haiku',
    envKey: 'ANTHROPIC_API_KEY',
    contextWindow: 200000,
    costTier: 1,
    speedTier: 5,
    qualityTier: 3,
    strengths: [QueryIntent.FACTUAL, QueryIntent.CONVERSATIONAL, QueryIntent.TRANSLATION],
    strongDomains: [QueryDomain.GENERAL],
    bestForComplexity: [QueryComplexity.SIMPLE, QueryComplexity.MODERATE],
    capabilities: { vision: true, realTime: false, longContext: true, code: true, reasoning: false, creative: false, multiModal: true },
  },

  // ─── Google Gemini ─────────────────────────────────────────────
  {
    id: 'gemini-1.5-pro',
    provider: 'google',
    model: 'gemini-1.5-pro',
    displayName: 'Gemini 1.5 Pro',
    envKey: 'GEMINI_API_KEY',
    contextWindow: 1000000,
    costTier: 3,
    speedTier: 3,
    qualityTier: 5,
    strengths: [QueryIntent.MULTI_MODAL, QueryIntent.ANALYTICAL, QueryIntent.SUMMARIZATION, QueryIntent.FACTUAL],
    strongDomains: [QueryDomain.SCIENCE, QueryDomain.EDUCATION, QueryDomain.TECHNOLOGY, QueryDomain.GENERAL],
    bestForComplexity: [QueryComplexity.COMPLEX, QueryComplexity.MODERATE],
    capabilities: { vision: true, realTime: false, longContext: true, code: true, reasoning: true, creative: true, multiModal: true },
  },
  {
    id: 'gemini-flash',
    provider: 'google',
    model: 'gemini-2.5-flash',
    displayName: 'Gemini 2.5 Flash',
    envKey: 'GEMINI_API_KEY',
    contextWindow: 1000000,
    costTier: 1,
    speedTier: 5,
    qualityTier: 4,
    strengths: [QueryIntent.FACTUAL, QueryIntent.CONVERSATIONAL, QueryIntent.MULTI_MODAL, QueryIntent.TRANSLATION],
    strongDomains: [QueryDomain.GENERAL, QueryDomain.EDUCATION, QueryDomain.ENTERTAINMENT],
    bestForComplexity: [QueryComplexity.SIMPLE, QueryComplexity.MODERATE],
    capabilities: { vision: true, realTime: false, longContext: true, code: true, reasoning: true, creative: true, multiModal: true },
  },

  // ─── xAI Grok ─────────────────────────────────────────────────
  {
    id: 'grok-3',
    provider: 'xai',
    model: 'grok-3',
    displayName: 'Grok 3',
    envKey: 'XAI_API_KEY',
    contextWindow: 128000,
    costTier: 3,
    speedTier: 4,
    qualityTier: 4,
    strengths: [QueryIntent.REAL_TIME, QueryIntent.ANALYTICAL, QueryIntent.FACTUAL, QueryIntent.CONVERSATIONAL],
    strongDomains: [QueryDomain.NEWS_CURRENT_EVENTS, QueryDomain.TECHNOLOGY, QueryDomain.ENTERTAINMENT, QueryDomain.GENERAL],
    bestForComplexity: [QueryComplexity.SIMPLE, QueryComplexity.MODERATE, QueryComplexity.COMPLEX],
    capabilities: { vision: false, realTime: true, longContext: true, code: true, reasoning: true, creative: true, multiModal: false },
  },
];

// ============================================================================
// Scoring Engine
// ============================================================================

function checkProviderAvailability(profile: ModelProfile): boolean {
  // Check if the required environment variable is set
  return !!process.env[profile.envKey];
}

function scoreCapabilityMatch(
  profile: ModelProfile,
  classification: QueryClassification
): number {
  let score = 0;
  const maxScore = 30;

  // Intent match (0-15)
  if (profile.strengths.includes(classification.primaryIntent)) {
    score += 10;
  }
  for (const secondary of classification.secondaryIntents) {
    if (profile.strengths.includes(secondary)) {
      score += 2.5;
    }
  }

  // Capability requirements (0-15)
  const caps = profile.capabilities;

  if (classification.requiresRealTime) {
    score += caps.realTime ? 8 : -5;
  }
  if (classification.requiresMultiModal) {
    score += caps.multiModal ? 8 : -10; // Hard penalty if can't handle multi-modal
  }
  if (classification.requiresLongContext) {
    score += caps.longContext ? 5 : -8;
  }
  if (classification.attachments.some(a => a.requiresVision)) {
    score += caps.vision ? 7 : -10;
  }
  if (classification.primaryIntent === QueryIntent.CODE) {
    score += caps.code ? 5 : -3;
  }
  if (classification.complexity === QueryComplexity.COMPLEX || classification.complexity === QueryComplexity.CLUTTERED) {
    score += caps.reasoning ? 5 : -3;
  }

  return Math.max(0, Math.min(maxScore, score));
}

function scoreQualityFit(
  profile: ModelProfile,
  classification: QueryClassification
): number {
  let score = 0;
  const maxScore = 25;

  // Domain match (0-10)
  if (profile.strongDomains.includes(classification.domain)) {
    score += 10;
  } else if (profile.strongDomains.includes(QueryDomain.GENERAL)) {
    score += 3;
  }

  // Complexity match (0-10)
  if (profile.bestForComplexity.includes(classification.complexity)) {
    score += 10;
  } else {
    // Partial credit for adjacent complexity
    const complexityOrder = [QueryComplexity.SIMPLE, QueryComplexity.MODERATE, QueryComplexity.COMPLEX, QueryComplexity.CLUTTERED];
    const targetIdx = complexityOrder.indexOf(classification.complexity);
    for (const supported of profile.bestForComplexity) {
      const supportedIdx = complexityOrder.indexOf(supported);
      const distance = Math.abs(targetIdx - supportedIdx);
      if (distance === 1) score += 5;
    }
  }

  // Quality tier bonus (0-5)
  score += profile.qualityTier;

  return Math.max(0, Math.min(maxScore, score));
}

function scoreCostEfficiency(
  profile: ModelProfile,
  classification: QueryClassification
): number {
  const maxScore = 20;

  // For simple queries, reward cheaper models; for complex, allow expensive ones
  switch (classification.complexity) {
    case QueryComplexity.SIMPLE: {
      // Simple queries should use cheap, fast models
      const costPenalty = (profile.costTier - 1) * 4; // 0, 4, 8, 12, 16
      return Math.max(0, maxScore - costPenalty);
    }
    case QueryComplexity.MODERATE: {
      // Moderate queries: balanced cost
      const costPenalty = Math.abs(profile.costTier - 3) * 3; // Optimal at tier 3
      return Math.max(0, maxScore - costPenalty);
    }
    case QueryComplexity.COMPLEX:
    case QueryComplexity.CLUTTERED: {
      // Complex queries: quality > cost, but still penalize extreme premium
      const qualityBonus = profile.qualityTier * 3;
      const costPenalty = profile.costTier > 4 ? 5 : 0;
      return Math.max(0, Math.min(maxScore, qualityBonus - costPenalty));
    }
    default:
      return 10;
  }
}

function scoreSpeed(
  profile: ModelProfile,
  classification: QueryClassification
): number {
  const maxScore = 15;

  // Simple/conversational queries benefit from fast models
  const speedImportance = classification.complexity === QueryComplexity.SIMPLE ? 1.5 :
    classification.primaryIntent === QueryIntent.CONVERSATIONAL ? 1.5 :
    classification.primaryIntent === QueryIntent.REAL_TIME ? 1.3 :
    classification.complexity === QueryComplexity.COMPLEX ? 0.6 :
    1.0;

  return Math.min(maxScore, Math.round(profile.speedTier * 3 * speedImportance));
}

function scoreContextFit(
  profile: ModelProfile,
  classification: QueryClassification
): number {
  const maxScore = 10;
  let score = 5; // Base

  // Penalty for insufficient context window
  if (classification.requiresLongContext && profile.contextWindow < 32000) {
    score -= 5;
  }

  // Bonus for models with large context when needed
  if (classification.requiresLongContext && profile.contextWindow >= 200000) {
    score += 3;
  }

  // Bonus for follow-up handling (long-context models maintain conversation better)
  if (classification.isFollowUp && profile.contextWindow >= 128000) {
    score += 2;
  }

  return Math.max(0, Math.min(maxScore, score));
}

function scoreModel(
  profile: ModelProfile,
  classification: QueryClassification
): ModelCandidate {
  const capabilityMatch = scoreCapabilityMatch(profile, classification);
  const qualityFit = scoreQualityFit(profile, classification);
  const costEfficiency = scoreCostEfficiency(profile, classification);
  const speedScore = scoreSpeed(profile, classification);
  const contextFit = scoreContextFit(profile, classification);

  const totalScore = capabilityMatch + qualityFit + costEfficiency + speedScore + contextFit;

  // Build reasoning
  const reasons: string[] = [];
  if (capabilityMatch >= 20) reasons.push('strong capability match');
  if (qualityFit >= 18) reasons.push('excellent quality fit');
  if (costEfficiency >= 15) reasons.push('cost-efficient');
  if (speedScore >= 12) reasons.push('fast');
  if (profile.capabilities.realTime && classification.requiresRealTime) reasons.push('real-time capable');
  if (profile.capabilities.multiModal && classification.requiresMultiModal) reasons.push('multi-modal capable');
  if (profile.bestForComplexity.includes(classification.complexity)) reasons.push(`optimized for ${classification.complexity} queries`);
  if (profile.strongDomains.includes(classification.domain)) reasons.push(`strong in ${classification.domain}`);

  return {
    id: profile.id,
    provider: profile.provider,
    model: profile.model,
    displayName: profile.displayName,
    score: totalScore,
    reasoning: reasons.length > 0 ? reasons.join(', ') : 'general-purpose match',
    scoreBreakdown: {
      capabilityMatch,
      qualityFit,
      costEfficiency,
      speedScore,
      contextFit,
    },
  };
}

// ============================================================================
// Adapter Mapping
// ============================================================================

function getAdapterName(provider: ProviderName): RoutingDecision['adapterName'] {
  switch (provider) {
    case 'openai': return 'openaiAdapter';
    case 'anthropic': return 'claudeAdapter';
    case 'google': return 'geminiAdapter';
    case 'xai': return 'xaiAdapter';
  }
}

// ============================================================================
// Main Router
// ============================================================================

/**
 * Route a classified query to the optimal AI model.
 *
 * @param classification - Output from queryClassifier
 * @param userPreference - User's explicit model preference (if any)
 * @returns RoutingDecision with the selected model and alternatives
 */
export function routeQuery(
  classification: QueryClassification,
  userPreference?: {
    /** User's selected model from UI (e.g., 'auto', 'openai', 'claude-sonnet', 'grok-1') */
    aiModel?: string;
    /** Specific model variant selected */
    selectedModel?: string;
  }
): RoutingDecision {
  // If user explicitly selected a specific model (not 'auto'), honor that
  if (userPreference?.selectedModel && userPreference.selectedModel !== 'auto') {
    return handleExplicitModelSelection(userPreference.selectedModel, classification);
  }

  if (userPreference?.aiModel && userPreference.aiModel !== 'auto') {
    return handleProviderPreference(userPreference.aiModel, classification);
  }

  // AUTO mode: intelligent routing
  return performIntelligentRouting(classification);
}

function handleExplicitModelSelection(
  selectedModel: string,
  classification: QueryClassification
): RoutingDecision {
  const normalized = selectedModel.toLowerCase();

  // Map user selection to model profile
  const modelMap: Record<string, { profile: ModelProfile; model: string }> = {};
  for (const profile of MODEL_PROFILES) {
    modelMap[profile.id.toLowerCase()] = { profile, model: profile.model };
  }

  // Also handle common aliases
  const aliases: Record<string, string> = {
    'gpt-4': 'gpt-4-turbo',
    'gpt-3.5': 'gpt-3.5-turbo',
    'claude': 'claude-sonnet',
    'claude-sonnet': 'claude-sonnet',
    'claude-opus': 'claude-opus',
    'claude-haiku': 'claude-haiku',
    'gemini': 'gemini-flash',
    'gemini-pro': 'gemini-1.5-pro',
    'gemini-flash': 'gemini-flash',
    'grok': 'grok-3',
    'grok-1': 'grok-3',
    'grok-3': 'grok-3',
  };

  const resolvedId = aliases[normalized] || normalized;
  const match = modelMap[resolvedId];

  if (match && checkProviderAvailability(match.profile)) {
    const candidate = scoreModel(match.profile, classification);
    return {
      selected: candidate,
      alternatives: getAlternatives(classification, match.profile.id),
      classification,
      provider: match.profile.provider,
      modelId: match.profile.model,
      adapterName: getAdapterName(match.profile.provider),
      confidence: 1.0, // User explicitly chose
      explanation: `User selected ${match.profile.displayName} (${candidate.reasoning})`,
    };
  }

  // Fallback to intelligent routing if explicit selection fails
  console.warn(`⚠️ Explicit model "${selectedModel}" not available, falling back to auto routing`);
  return performIntelligentRouting(classification);
}

function handleProviderPreference(
  aiModel: string,
  classification: QueryClassification
): RoutingDecision {
  const providerMap: Record<string, ProviderName> = {
    'openai': 'openai',
    'claude-sonnet': 'anthropic',
    'gemini': 'google',
    'xai': 'xai',
  };

  const provider = providerMap[aiModel.toLowerCase()];
  if (!provider) {
    return performIntelligentRouting(classification);
  }

  // Get all models for this provider and pick the best
  const providerModels = MODEL_PROFILES.filter(
    m => m.provider === provider && checkProviderAvailability(m)
  );

  if (providerModels.length === 0) {
    console.warn(`⚠️ No available models for provider "${provider}", falling back to auto routing`);
    return performIntelligentRouting(classification);
  }

  // Score and rank models within the provider
  const candidates = providerModels
    .map(p => scoreModel(p, classification))
    .sort((a, b) => b.score - a.score);

  const selected = candidates[0];
  const profile = providerModels.find(p => p.id === selected.id)!;

  return {
    selected,
    alternatives: candidates.slice(1),
    classification,
    provider,
    modelId: profile.model,
    adapterName: getAdapterName(provider),
    confidence: 0.85,
    explanation: `User preferred ${provider}, selected ${selected.displayName} (${selected.reasoning})`,
  };
}

function performIntelligentRouting(classification: QueryClassification): RoutingDecision {
  // Score all available models
  const availableModels = MODEL_PROFILES.filter(checkProviderAvailability);

  if (availableModels.length === 0) {
    // No models available — return a default fallback
    console.error('❌ No AI models available (no API keys configured)');
    const fallbackProfile = MODEL_PROFILES.find(m => m.id === 'gpt-4o-mini')!;
    const fallbackCandidate: ModelCandidate = {
      id: fallbackProfile.id,
      provider: fallbackProfile.provider,
      model: fallbackProfile.model,
      displayName: fallbackProfile.displayName,
      score: 0,
      reasoning: 'fallback - no API keys configured',
      scoreBreakdown: { capabilityMatch: 0, qualityFit: 0, costEfficiency: 0, speedScore: 0, contextFit: 0 },
    };
    return {
      selected: fallbackCandidate,
      alternatives: [],
      classification,
      provider: 'openai',
      modelId: 'gpt-4o-mini',
      adapterName: 'openaiAdapter',
      confidence: 0.1,
      explanation: 'No AI models available — using default fallback',
    };
  }

  // Score all candidates
  const candidates = availableModels
    .map(p => scoreModel(p, classification))
    .sort((a, b) => b.score - a.score);

  const selected = candidates[0];
  const selectedProfile = availableModels.find(p => p.id === selected.id)!;

  // Calculate confidence based on score gap between #1 and #2
  let confidence = 0.7;
  if (candidates.length >= 2) {
    const gap = selected.score - candidates[1].score;
    confidence = Math.min(0.98, 0.6 + (gap / 100));
  }
  if (selected.score >= 70) confidence = Math.max(confidence, 0.85);

  // Build explanation
  const explanationParts: string[] = [
    `Query: ${classification.complexity} ${classification.primaryIntent}`,
    `Domain: ${classification.domain}`,
    `Selected: ${selected.displayName} (score: ${selected.score}/100)`,
    `Reason: ${selected.reasoning}`,
  ];
  if (classification.requiresRealTime) explanationParts.push('Requires: real-time data');
  if (classification.requiresMultiModal) explanationParts.push('Requires: multi-modal processing');
  if (classification.requiresLongContext) explanationParts.push('Requires: long context window');

  return {
    selected,
    alternatives: candidates.slice(1, 4),
    classification,
    provider: selectedProfile.provider,
    modelId: selectedProfile.model,
    adapterName: getAdapterName(selectedProfile.provider),
    confidence,
    explanation: explanationParts.join(' | '),
  };
}

function getAlternatives(
  classification: QueryClassification,
  excludeId: string
): ModelCandidate[] {
  return MODEL_PROFILES
    .filter(p => p.id !== excludeId && checkProviderAvailability(p))
    .map(p => scoreModel(p, classification))
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);
}

// ============================================================================
// Utility: Resolve routing to existing adapter format
// ============================================================================

/**
 * Convert a routing decision into the format expected by the existing AI route.
 * This bridges the new intelligent router with the existing resolveSelectedChatModel logic.
 */
export function resolveRoutingToLegacy(decision: RoutingDecision): {
  provider: 'openai' | 'anthropic' | 'google' | 'xai';
  model: string;
} {
  return {
    provider: decision.provider,
    model: decision.modelId,
  };
}

/**
 * Get a human-readable summary of the routing decision for logging/debugging.
 */
export function formatRoutingLog(decision: RoutingDecision): string {
  const { selected, classification, confidence, explanation } = decision;
  const altNames = decision.alternatives.map(a => `${a.displayName}(${a.score})`).join(', ');

  return [
    `🧠 Model Router Decision`,
    `├─ Query: "${classification.normalizedQuery.substring(0, 80)}${classification.normalizedQuery.length > 80 ? '...' : ''}"`,
    `├─ Classification: ${classification.complexity} | ${classification.primaryIntent} | ${classification.domain}`,
    `├─ Attachments: ${classification.attachments.length > 0 ? classification.attachments.map(a => a.type).join(', ') : 'none'}`,
    `├─ Selected: ${selected.displayName} (${selected.provider}/${selected.model}) — score: ${selected.score}/100`,
    `├─ Score Breakdown: cap=${selected.scoreBreakdown.capabilityMatch} qual=${selected.scoreBreakdown.qualityFit} cost=${selected.scoreBreakdown.costEfficiency} speed=${selected.scoreBreakdown.speedScore} ctx=${selected.scoreBreakdown.contextFit}`,
    `├─ Confidence: ${(confidence * 100).toFixed(0)}%`,
    `├─ Alternatives: ${altNames || 'none'}`,
    `└─ Explanation: ${explanation}`,
  ].join('\n');
}

export default routeQuery;
