/**
 * Prompt Template Engine
 * Generates optimized prompt templates based on query classification.
 * Each complexity level and intent type gets a tailored prompt structure
 * designed to extract maximum quality from the selected AI model.
 *
 * Architecture:
 *   QueryClassification → PromptTemplateEngine → Optimized System + User Prompts
 *
 * Key Features:
 *   - Complexity-adaptive prompt depth (simple=concise, complex=chain-of-thought)
 *   - Intent-specific formatting instructions
 *   - Model-aware optimization (different providers have different strengths)
 *   - Attachment-aware context injection
 *   - Cluttered query preprocessing and restructuring
 */

import {
  QueryClassification,
  QueryComplexity,
  QueryIntent,
  QueryDomain,
  AttachmentType,
} from './queryClassifier';

// ============================================================================
// Types
// ============================================================================

export interface PromptTemplate {
  /** System prompt for the AI model */
  systemPrompt: string;
  /** Formatted user prompt */
  userPrompt: string;
  /** Additional context block (web results, attachments, user profile) */
  contextBlock: string;
  /** Thinking/reasoning instructions for complex queries */
  reasoningInstructions?: string;
  /** Output format guidance */
  formatGuidance: string;
  /** Max tokens suggestion based on complexity */
  suggestedMaxTokens: number;
  /** Temperature suggestion */
  suggestedTemperature: number;
  /** Metadata about the prompt construction */
  metadata: {
    complexity: QueryComplexity;
    intent: QueryIntent;
    domain: QueryDomain;
    wasCleanedUp: boolean;
    originalQuery?: string;
  };
}

export interface PromptContext {
  /** User profile information */
  userProfile?: {
    name?: string;
    age?: number | null;
    location?: string;
    interests?: string;
    pulse?: string;
    bio?: string;
  };
  /** User mood context */
  mood?: {
    current: string;
    energy: string;
  };
  /** Chat history for conversation continuity */
  chatHistory?: Array<{ role: string; content: string }>;
  /** Pre-fetched web results from middleware */
  webResults?: Array<{
    title: string;
    url: string;
    content: string;
  }>;
  /** Language for response */
  language?: string;
  /** Narration style */
  narrationType?: string;
  /** Interaction mode */
  interactionMode?: 'read' | 'listen';
  /** Provider hint for model-specific optimizations */
  targetProvider?: 'openai' | 'anthropic' | 'google' | 'xai';
}

// ============================================================================
// Prompt Building Blocks
// ============================================================================

const PERSONA_BASE = `You are an expert AI assistant with deep knowledge across multiple domains. You provide accurate, well-structured, and contextually relevant responses.`;

const PERSONA_BY_DOMAIN: Record<QueryDomain, string> = {
  [QueryDomain.TECHNOLOGY]: `You are a seasoned technology expert and systems architect with deep knowledge of software development, cloud infrastructure, and emerging tech trends.`,
  [QueryDomain.SCIENCE]: `You are a research scientist with expertise across physics, chemistry, biology, and interdisciplinary sciences. You explain complex concepts with clarity and precision.`,
  [QueryDomain.FINANCE]: `You are a financial analyst and advisor with expertise in markets, investing, economics, and personal finance. You provide data-driven, balanced financial insights.`,
  [QueryDomain.HEALTH]: `You are a knowledgeable health information specialist. You provide evidence-based health information while emphasizing the importance of professional medical consultation.`,
  [QueryDomain.EDUCATION]: `You are an expert educator and learning designer. You break complex topics into understandable components and tailor explanations to the learner's level.`,
  [QueryDomain.CREATIVE_WRITING]: `You are a versatile creative writer with mastery of multiple genres, literary devices, and narrative techniques. You produce engaging, original content.`,
  [QueryDomain.PROGRAMMING]: `You are a senior software engineer with expertise across multiple languages, frameworks, and paradigms. You write clean, well-documented, production-quality code.`,
  [QueryDomain.BUSINESS]: `You are a strategy consultant with expertise in business operations, marketing, and organizational management. You provide actionable business insights.`,
  [QueryDomain.HISTORY]: `You are a historian with broad knowledge across civilizations, eras, and themes. You provide contextualized, nuanced historical analysis.`,
  [QueryDomain.PSYCHOLOGY]: `You are a psychology expert with knowledge of cognitive science, behavioral patterns, and mental health. You provide compassionate, evidence-based insights.`,
  [QueryDomain.MATHEMATICS]: `You are a mathematician with expertise in pure and applied mathematics. You solve problems step-by-step and explain mathematical reasoning clearly.`,
  [QueryDomain.LAW]: `You are a legal information specialist. You explain legal concepts clearly while noting that specific legal advice should come from a licensed attorney.`,
  [QueryDomain.NEWS_CURRENT_EVENTS]: `You are a well-informed journalist with expertise in current events, politics, and global affairs. You provide balanced, fact-based reporting.`,
  [QueryDomain.ENTERTAINMENT]: `You are a media and entertainment expert with broad knowledge of film, music, gaming, and pop culture.`,
  [QueryDomain.GENERAL]: PERSONA_BASE,
};

function buildPersona(classification: QueryClassification): string {
  return PERSONA_BY_DOMAIN[classification.domain] || PERSONA_BASE;
}

function buildUserProfileContext(profile?: PromptContext['userProfile']): string {
  if (!profile) return '';
  const lines = [
    profile.name && `Name: ${profile.name}`,
    profile.age && `Age: ${profile.age}`,
    profile.location && `Location: ${profile.location}`,
    profile.interests && `Interests: ${profile.interests}`,
    profile.pulse && `Personality: ${profile.pulse}`,
    profile.bio && `Background: ${profile.bio}`,
  ].filter(Boolean);

  if (lines.length === 0) return '';
  return `\n\n[User Context: ${lines.join(' | ')}]`;
}

function buildWebContext(webResults?: PromptContext['webResults']): string {
  if (!webResults || webResults.length === 0) return '';
  const formatted = webResults
    .slice(0, 5)
    .map((r, i) => `${i + 1}. **${r.title}** (${r.url})\n${r.content}`)
    .join('\n\n');
  return `\n\n## Current Web Information (prioritize over training data):\n${formatted}\n`;
}

function buildAttachmentContext(classification: QueryClassification): string {
  if (classification.attachments.length === 0) return '';

  const lines = classification.attachments.map(a => {
    const sizeStr = a.sizeKB > 1024 ? `${(a.sizeKB / 1024).toFixed(1)}MB` : `${a.sizeKB}KB`;
    return `- **${a.name}** (${a.type}, ${sizeStr})`;
  });

  let instructions = '';
  const hasVision = classification.attachments.some(a => a.requiresVision);
  const hasOCR = classification.attachments.some(a => a.requiresOCR);
  const hasAudio = classification.attachments.some(a => a.requiresAudioProcessing);
  const hasCode = classification.attachments.some(a => a.type === AttachmentType.CODE_FILE);
  const hasSpreadsheet = classification.attachments.some(a => a.type === AttachmentType.SPREADSHEET);

  if (hasVision) instructions += '\n- Analyze the images in detail: describe content, detect text, identify objects/patterns.';
  if (hasOCR) instructions += '\n- Extract and process all text from the documents.';
  if (hasAudio) instructions += '\n- Process the audio content and provide relevant analysis.';
  if (hasCode) instructions += '\n- Review the code files: analyze structure, identify issues, suggest improvements.';
  if (hasSpreadsheet) instructions += '\n- Analyze the spreadsheet data: identify patterns, summarize key metrics.';

  return `\n\n## Attached Files:\n${lines.join('\n')}\n\n**Processing Instructions:**${instructions}`;
}

// ============================================================================
// Complexity-Adaptive Prompt Strategies
// ============================================================================

function buildSimplePrompt(
  classification: QueryClassification,
  context: PromptContext
): { system: string; user: string; reasoning?: string } {
  const persona = buildPersona(classification);

  const system = `${persona}

Instructions:
- Provide a direct, concise answer (2-5 sentences).
- No preamble, no filler, no unnecessary elaboration.
- If the answer is a fact, state it directly.
${context.language ? `- Respond in ${context.language}.` : ''}`;

  const user = `${classification.normalizedQuery}${buildUserProfileContext(context.userProfile)}${buildWebContext(context.webResults)}`;

  return { system, user };
}

function buildModeratePrompt(
  classification: QueryClassification,
  context: PromptContext
): { system: string; user: string; reasoning?: string } {
  const persona = buildPersona(classification);
  const intentGuide = getIntentGuidance(classification.primaryIntent);

  const system = `${persona}

Instructions:
${intentGuide}
- Structure your response with clear sections when helpful.
- Provide specific examples or evidence to support your points.
- Balance thoroughness with readability (aim for 200-400 words).
- Use **bold** for key terms and headings.
${context.language ? `- Respond entirely in ${context.language}.` : ''}
${context.narrationType === 'Educational' ? '- Use educational formatting only when it improves clarity; do not force tables/charts/tabs/sliders in every answer.' : ''}
${context.narrationType === 'Dramatic' ? '- Add engaging narrative elements and emotional depth.' : ''}`;

  const user = `${classification.normalizedQuery}${buildUserProfileContext(context.userProfile)}${buildWebContext(context.webResults)}${buildAttachmentContext(classification)}`;

  return { system, user };
}

function buildComplexPrompt(
  classification: QueryClassification,
  context: PromptContext
): { system: string; user: string; reasoning: string } {
  const persona = buildPersona(classification);
  const intentGuide = getIntentGuidance(classification.primaryIntent);

  const reasoning = `Think through this step-by-step:
1. **Understand**: What exactly is being asked? Break down the request into components.
2. **Context**: What domain knowledge, current events, or technical background is relevant?
3. **Analyze**: What are the key considerations, trade-offs, or perspectives?
4. **Synthesize**: How do these elements come together into a coherent answer?
5. **Verify**: Does the response fully address all parts of the query?`;

  const system = `${persona}

You are handling a complex query that requires deep analysis. Follow these guidelines:

${intentGuide}

**Response Structure:**
- Begin with a brief executive summary (2-3 sentences).
- Organize into logical sections with clear **headings**.
- Provide evidence, examples, and references where applicable.
- Address nuances, edge cases, and trade-offs.
- Conclude with a synthesis and actionable next steps.
- Target 400-800 words unless the topic demands more.

${context.language ? `**Language**: Respond entirely in ${context.language}.` : ''}
${context.narrationType === 'Educational' ? '\n**Style**: Use educational formatting selectively—add tables/diagrams/tabs/progress only when they materially improve understanding.' : ''}
${context.narrationType === 'Dramatic' ? '\n**Style**: Weave narrative tension, emotional depth, and storytelling into the analysis.' : ''}

**Quality Standards:**
- Cite specific sources, studies, or examples when making claims.
- Distinguish between established facts and expert opinions.
- Acknowledge limitations or areas of uncertainty honestly.`;

  const user = `${classification.normalizedQuery}${buildUserProfileContext(context.userProfile)}${buildWebContext(context.webResults)}${buildAttachmentContext(classification)}`;

  return { system, user, reasoning };
}

function buildClutteredPrompt(
  classification: QueryClassification,
  context: PromptContext
): { system: string; user: string; reasoning: string } {
  const persona = buildPersona(classification);

  // Pre-process the cluttered query: identify the core question(s)
  const reasoning = `The user's query appears to contain multiple topics or unclear structure. 
Before answering:
1. **Parse**: Identify the distinct questions or topics in the query.
2. **Prioritize**: Determine the most likely primary intent.
3. **Clarify**: If genuinely ambiguous, briefly acknowledge the interpretation before answering.
4. **Restructure**: Address each identifiable question systematically.
5. **Connect**: Find the thread that ties the topics together, if any.`;

  const system = `${persona}

**Special Handling: Complex/Cluttered Query**

The user's query may be poorly structured, contain multiple topics, or have ambiguous intent.

Your approach:
1. Parse the query to identify the core question(s) despite the cluttered format.
2. If the query contains multiple distinct questions, address them in order of importance.
3. If the intent is genuinely unclear, briefly state your interpretation, then provide a comprehensive answer.
4. DO NOT ask for clarification unless absolutely necessary—make reasonable inferences.
5. Structure your response clearly with headings for each topic/question identified.

${context.language ? `**Language**: Respond entirely in ${context.language}.` : ''}

**Format Guidelines:**
- Use numbered sections if addressing multiple questions.
- Bold the interpreted question before each answer.
- Keep individual answers focused and concise.
- End with a brief summary tying everything together.`;

  const user = `${classification.normalizedQuery}${buildUserProfileContext(context.userProfile)}${buildWebContext(context.webResults)}${buildAttachmentContext(classification)}`;

  return { system, user, reasoning };
}

// ============================================================================
// Intent-Specific Guidance
// ============================================================================

function getIntentGuidance(intent: QueryIntent): string {
  switch (intent) {
    case QueryIntent.FACTUAL:
      return `- Provide a precise, factual answer.
- Cite sources or evidence when available.
- Keep the response focused and direct.`;

    case QueryIntent.ANALYTICAL:
      return `- Analyze the topic from multiple angles.
- Present cause-effect relationships and implications.
- Use evidence-based reasoning throughout.
- Include different perspectives when relevant.`;

    case QueryIntent.CREATIVE:
      return `- Be creative, original, and engaging.
- Use vivid language, imagery, and storytelling techniques.
- Maintain a consistent voice and style throughout.
- Surprise the reader with unexpected insights or turns.`;

    case QueryIntent.CODE:
      return `- Provide working, well-commented code.
- Follow language-specific best practices and conventions.
- Explain the approach and key design decisions.
- Include error handling and edge cases.
- Use consistent formatting and naming conventions.`;

    case QueryIntent.COMPARISON:
      return `- Create a structured comparison (table or side-by-side).
- Evaluate each option on consistent criteria.
- Highlight key differences and trade-offs.
- Provide a recommendation based on common use cases.`;

    case QueryIntent.CONVERSATIONAL:
      return `- Keep it natural, warm, and conversational.
- Be concise—match the casual tone of the query.
- Don't over-explain or add unnecessary formality.`;

    case QueryIntent.REAL_TIME:
      return `- Prioritize accuracy of current/real-time information.
- State the data source and timestamp when available.
- Clearly distinguish between real-time data and general knowledge.
- NEVER say "I don't have access to real-time data" if web results are provided.`;

    case QueryIntent.MULTI_MODAL:
      return `- Analyze all provided media (images, documents, audio, video) thoroughly.
- Reference specific elements in the media when discussing them.
- Combine insights from both the text query and the media.
- Provide structured analysis of each attachment.`;

    case QueryIntent.INSTRUCTIONAL:
      return `- Provide clear, numbered step-by-step instructions.
- Include prerequisites and requirements upfront.
- Add tips, warnings, and common pitfalls where relevant.
- Conclude with verification steps or expected outcomes.`;

    case QueryIntent.MATHEMATICAL:
      return `- Show the complete solution process step-by-step.
- Use proper mathematical notation.
- Explain the reasoning behind each step.
- Verify the answer with a check or alternative method.`;

    case QueryIntent.TRANSLATION:
      return `- Provide an accurate, natural-sounding translation.
- Note any cultural nuances or context.
- Include transliteration for non-Latin scripts when helpful.`;

    case QueryIntent.SUMMARIZATION:
      return `- Extract the key points and main ideas.
- Organize in order of importance.
- Keep the summary significantly shorter than the source.
- Preserve the original meaning and nuance.`;

    default:
      return `- Provide a thorough, well-structured response.
- Balance detail with readability.`;
  }
}

// ============================================================================
// Model-Specific Optimizations
// ============================================================================

function applyProviderOptimizations(
  system: string,
  user: string,
  provider?: string
): { system: string; user: string } {
  switch (provider) {
    case 'anthropic':
      // Claude excels with XML-like structure and explicit instructions
      return {
        system: system + `\n\n<guidelines>
- Use your full reasoning capacity for complex queries.
- Be direct and avoid unnecessary hedging or disclaimers.
- When uncertain, express calibrated uncertainty rather than false confidence.
</guidelines>`,
        user,
      };

    case 'google':
      // Gemini works well with structured prompts and grounding
      return {
        system: system + `\n\nAdditional guidelines:
- Leverage your multimodal understanding when processing attachments.
- Ground responses in factual, verifiable information.
- Use your knowledge cutoff date awareness appropriately.`,
        user,
      };

    case 'xai':
      // Grok excels with real-time, direct responses
      return {
        system: system + `\n\nAdditional guidelines:
- Leverage your real-time knowledge for current events and data.
- Be direct and informative without unnecessary formality.
- Use your strength in reasoning and factual accuracy.`,
        user,
      };

    case 'openai':
    default:
      // GPT models work well with structured, role-based prompts
      return { system, user };
  }
}

// ============================================================================
// Format Guidance Builders
// ============================================================================

function buildFormatGuidance(
  classification: QueryClassification,
  context: PromptContext
): string {
  const isListen = context.interactionMode === 'listen';
  const parts: string[] = [];

  if (isListen) {
    parts.push('Format for audio narration: plain text only, no markdown, no tables, no emojis, no code blocks.');
    parts.push('Keep responses conversational and suitable for spoken delivery.');
  } else {
    // Read mode formatting
    switch (classification.primaryIntent) {
      case QueryIntent.CODE:
        parts.push('Use fenced code blocks with language labels for all code.');
        parts.push('Separate explanation from code clearly.');
        break;

      case QueryIntent.COMPARISON:
        parts.push('Use a comparison table only when the comparison has multiple dimensions; otherwise use concise bullets.');
        parts.push('Format: ```table\n{"title":"...","columns":[...],"rows":[...]}\n```');
        break;

      case QueryIntent.MATHEMATICAL:
        parts.push('Use proper mathematical notation with LaTeX/KaTeX when applicable.');
        parts.push('Show each step on a separate line.');
        break;

      case QueryIntent.INSTRUCTIONAL:
        parts.push('Use numbered steps with clear formatting.');
        parts.push('Highlight prerequisites, tips, and warnings distinctly.');
        break;

      default:
        if (classification.complexity !== QueryComplexity.SIMPLE) {
          parts.push('Use **bold headings** for sections.');
          parts.push('Use bullet points for lists.');
          parts.push('Include structured blocks (table/tabs/progress/chart) only when they add real clarity.');
        }
    }

    if (context.narrationType === 'Educational') {
      parts.push('Educational style: prioritize clarity first; use advanced markdown blocks only when the content demands it.');
    }
  }

  // Suggestions line for non-simple queries
  if (classification.complexity !== QueryComplexity.SIMPLE && !isListen) {
    parts.push('End with: Suggested Next Topics: topic 1 | topic 2 | topic 3');
  }

  return parts.join('\n');
}

function getSuggestedMaxTokens(classification: QueryClassification): number {
  switch (classification.complexity) {
    case QueryComplexity.SIMPLE:
      return 256;
    case QueryComplexity.MODERATE:
      return 1024;
    case QueryComplexity.COMPLEX:
      return 2048;
    case QueryComplexity.CLUTTERED:
      return 1536;
    default:
      return 1024;
  }
}

function getSuggestedTemperature(classification: QueryClassification): number {
  switch (classification.primaryIntent) {
    case QueryIntent.FACTUAL:
    case QueryIntent.MATHEMATICAL:
    case QueryIntent.CODE:
      return 0.3; // Low creativity, high precision
    case QueryIntent.ANALYTICAL:
    case QueryIntent.COMPARISON:
    case QueryIntent.INSTRUCTIONAL:
      return 0.5; // Balanced
    case QueryIntent.CREATIVE:
      return 0.8; // High creativity
    case QueryIntent.CONVERSATIONAL:
      return 0.7; // Natural conversation
    default:
      return 0.5;
  }
}

// ============================================================================
// Main Template Builder
// ============================================================================

export function buildOptimizedPrompt(
  classification: QueryClassification,
  context: PromptContext
): PromptTemplate {
  let promptParts: { system: string; user: string; reasoning?: string };

  // Select prompt strategy based on complexity
  switch (classification.complexity) {
    case QueryComplexity.SIMPLE:
      promptParts = buildSimplePrompt(classification, context);
      break;
    case QueryComplexity.MODERATE:
      promptParts = buildModeratePrompt(classification, context);
      break;
    case QueryComplexity.COMPLEX:
      promptParts = buildComplexPrompt(classification, context);
      break;
    case QueryComplexity.CLUTTERED:
      promptParts = buildClutteredPrompt(classification, context);
      break;
    default:
      promptParts = buildModeratePrompt(classification, context);
  }

  // Apply provider-specific optimizations
  const { system: optimizedSystem, user: optimizedUser } = applyProviderOptimizations(
    promptParts.system,
    promptParts.user,
    context.targetProvider
  );

  // Build format guidance
  const formatGuidance = buildFormatGuidance(classification, context);

  // Build context block
  const contextParts = [
    buildUserProfileContext(context.userProfile),
    buildWebContext(context.webResults),
    buildAttachmentContext(classification),
  ].filter(Boolean).join('');

  return {
    systemPrompt: optimizedSystem,
    userPrompt: optimizedUser,
    contextBlock: contextParts,
    reasoningInstructions: promptParts.reasoning,
    formatGuidance,
    suggestedMaxTokens: getSuggestedMaxTokens(classification),
    suggestedTemperature: getSuggestedTemperature(classification),
    metadata: {
      complexity: classification.complexity,
      intent: classification.primaryIntent,
      domain: classification.domain,
      wasCleanedUp: classification.complexity === QueryComplexity.CLUTTERED,
      originalQuery: classification.complexity === QueryComplexity.CLUTTERED
        ? classification.originalQuery
        : undefined,
    },
  };
}

export default buildOptimizedPrompt;
