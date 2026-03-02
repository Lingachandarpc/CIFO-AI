/**
 * AI Model Adapters for Middleware
 * These adapters wrap each AI service to work with the middleware layer
 */

import { generateNarrativeWithWebSearch as geminiOriginal } from './geminiService';
import { generateNarrativeWithWebSearch as claudeOriginal } from './claudeService';
import { generateNarrativeWithWebSearch as xaiOriginal } from './xaiService';
import { MiddlewareContext } from './middlewareService';
import OpenAI from 'openai';

function withLanguageLock(query: string, language: string): string {
  return `CRITICAL LANGUAGE LOCK: Respond entirely in ${language}. Do not switch to English unless the user explicitly asks for English.\n\nUser Query:\n${query}`;
}

// ============================================================================
// Gemini Adapter
// ============================================================================

export async function geminiAdapter(
  enrichedQuery: string,
  context: MiddlewareContext,
  options: {
    narrationTime: number;
    narrationType: string;
    language: string;
    interactionMode: 'read' | 'listen';
    selectedModel?: string;
  }
): Promise<string> {
  const lockedQuery = withLanguageLock(context.query, options.language);
  // Pass middleware's pre-fetched web results (includes WorldTimeAPI data for time queries)
  const result = await geminiOriginal(
    lockedQuery,
    options.narrationTime,
    options.narrationType,
    options.language,
    options.interactionMode,
    false, // Disable internal web search - middleware handles it
    context.chatHistory || [],
    {
      profile: context.userContext.profile,
      attachments: context.userContext.attachments,
    },
    context.webResults, // Pass pre-fetched results from middleware
    options.selectedModel
  );

  return result.narration;
}

// ============================================================================
// Claude Adapter
// ============================================================================

export async function claudeAdapter(
  enrichedQuery: string,
  context: MiddlewareContext,
  options: {
    narrationTime: number;
    narrationType: string;
    language: string;
    interactionMode: 'read' | 'listen';
    selectedModel?: string;
  }
): Promise<string> {
  const lockedQuery = withLanguageLock(context.query, options.language);
  // Pass middleware's pre-fetched web results (includes WorldTimeAPI data for time queries)
  const result = await claudeOriginal(
    lockedQuery,
    options.narrationTime,
    options.narrationType,
    options.language,
    options.interactionMode,
    false, // Middleware handles web search
    context.chatHistory || [],
    { profile: context.userContext.profile },
    context.webResults, // Pass pre-fetched results from middleware
    options.selectedModel
  );

  return result.narration;
}

// ============================================================================
// XAI Adapter
// ============================================================================

export async function xaiAdapter(
  enrichedQuery: string,
  context: MiddlewareContext,
  options: {
    narrationTime: number;
    narrationType: string;
    language: string;
    interactionMode: 'read' | 'listen';
    selectedModel?: string;
  }
): Promise<string> {
  const lockedQuery = withLanguageLock(context.query, options.language);
  // Pre-check: fail fast if XAI_API_KEY is not configured
  if (!process.env.XAI_API_KEY) {
    throw new Error('X.AI API key not configured');
  }

  // Pass middleware's pre-fetched web results (includes WorldTimeAPI data for time queries)
  const result = await xaiOriginal(
    lockedQuery,
    options.narrationTime,
    options.narrationType,
    options.language,
    options.interactionMode,
    false, // Middleware handles web search
    context.chatHistory || [],
    { profile: context.userContext.profile },
    context.webResults, // Pass pre-fetched results from middleware
    options.selectedModel
  );

  // Detect error responses returned as narration text
  if (
    result.narration.startsWith('X.AI API key not configured') ||
    result.narration.startsWith('X.AI error')
  ) {
    throw new Error(result.narration);
  }

  return result.narration;
}

// ============================================================================
// OpenAI Adapter
// ============================================================================

export async function openaiAdapter(
  enrichedQuery: string,
  context: MiddlewareContext,
  options: {
    narrationTime: number;
    narrationType: string;
    language: string;
    interactionMode: 'read' | 'listen';
    selectedModel?: string;
  }
): Promise<string> {
  const openaiKey = process.env.OPENAI_API_KEY;
  if (!openaiKey) {
    throw new Error('OpenAI API key not configured');
  }

  const openai = new OpenAI({ apiKey: openaiKey });

  const narrativeStyleGuide = {
    Realistic:
      'Tell the story in a realistic, factual, and grounded manner with real-world examples.',
    Dramatic:
      'Tell the story with dramatic flair, engaging tension, and emotional depth.',
    Educational:
      'Tell the story in an educational style, focusing on learning outcomes and key insights.',
    Personalized:
      'Tailor the response to the user profile context (age, interests, personality pulse, bio, location) while staying factual and helpful.',
  };

  const styleInstruction =
    narrativeStyleGuide[
      options.narrationType as keyof typeof narrativeStyleGuide
    ] || narrativeStyleGuide.Realistic;

  const timeDescription =
    options.narrationTime <= 2
      ? 'brief (under 2 minutes)'
      : options.narrationTime <= 5
      ? 'short (2-5 minutes)'
      : 'medium-length (5+ minutes)';

  // Build context from middleware
  let contextStr = '';
  if (context.userContext.profile) {
    const p = context.userContext.profile;
    contextStr = [
      p.name && `User: ${p.name}`,
      p.age && `Age: ${p.age}`,
      p.location && `Location: ${p.location}`,
      p.interests && `Interests: ${p.interests}`,
      p.pulse && `Personality: ${p.pulse}`,
      p.bio && `Background: ${p.bio}`,
    ]
      .filter(Boolean)
      .join(', ');
  }

  // Add mood context
  if (context.userContext.mood) {
    const m = context.userContext.mood;
    contextStr += contextStr
      ? ` | Mood: ${m.current} (${m.energy} energy)`
      : `Mood: ${m.current} (${m.energy} energy)`;
  }

  // Format web results from middleware
  const webContext =
    context.webResults.length > 0
      ? `\n\n## Current Web Information:\n${context.webResults
          .map((r, i) => `${i + 1}. **${r.title}** (${r.url})\n${r.content}`)
          .join('\n\n')}\n`
      : '';

  // Check if we're in a clarification flow
  const chatHistory = context.chatHistory || [];
  const previousAssistantMsg = chatHistory.length >= 2 ? chatHistory[chatHistory.length - 2] : null;
  const isRespondingToClarification = previousAssistantMsg?.role === 'assistant' && 
    (previousAssistantMsg.content.includes('could you please specify') || 
     previousAssistantMsg.content.includes('Which ') ||
     previousAssistantMsg.content.includes('please provide'));

  // If responding to clarification, extract original question and combine
  let finalQuery = context.query;
  if (isRespondingToClarification && chatHistory.length >= 3) {
    const originalQuestion = chatHistory[chatHistory.length - 3]?.content || context.query;
    finalQuery = `${originalQuestion} ${context.query}`;
  }
  finalQuery = withLanguageLock(finalQuery, options.language);

  const clarificationContext = isRespondingToClarification && chatHistory.length >= 3
    ? '\n\nIMPORTANT: The user just provided clarification to your previous question. Use this information to answer their ORIGINAL question completely. Do not just acknowledge their response - provide the full answer they were seeking.'
    : '';

  const helpfulnessGuideline = '\n\nCRITICAL INSTRUCTIONS - YOU MUST FOLLOW THESE:\n1. NEVER EVER say "I don\'t have access to real-time data" or "I can\'t check the information" or "Check a news website"\n2. When you see **Current Time**: [time] in the context below, that IS the real current time - USE IT DIRECTLY\n3. Greeting rule: if you greet, use exactly "Hi {name}" and only once per ongoing session/topic. Never include location/city in the greeting.\n4. When you see web search results below, PRIORITIZE information from trusted local news sources (BBC, Reuters, AP News, country-specific outlets)\n5. For location-specific queries (movies, news, events, doomsday predictions): First verify the location context, then provide location-relevant information\n6. For time questions: State the EXACT time shown in **Current Time**: field. Example: "It\'s currently 9:57 PM IST."\n7. For time-contextual questions ("is it good time for coffee?"): First state the current time from **Current Time**: field, then give recommendation\n8. For news/current events: Use web search data from trusted sources and prioritize region-specific outlets over general ones\n9. ALWAYS be solution-oriented and helpful - provide actual answers with sources, not excuses\n10. Location Context: If user is in specific region (India, USA, Tamil Nadu), validate that results are relevant to that location. If results are global/irrelevant, state ONLY verified local information\n\nTypical schedules for context: coffee good in morning (6am-11am), lunch around noon-2pm, dinner 6pm-9pm, sleep 9pm-6am';

  const isListenMode = options.interactionMode === 'listen';
  const readModeComponentGuide = !isListenMode
    ? `
Read mode component formatting contract:
- Do NOT use markdown pipe tables or separator rows.
- For tables, use fenced code blocks labeled \`table\` using JSON:
  \`\`\`table
  {"title":"Comparison","columns":["Aspect","A","B"],"rows":[["Speed","Fast","Medium"],["Cost","High","Low"]]}
  \`\`\`
- For tabbed content, use fenced code blocks labeled \`tabs\` with lines that start as: \`Tab: Label\`.
- For ratings/scales, use fenced code blocks labeled \`progress\` with keys: label, value, left, right.
- If user asks to play games, says they are bored, or requests fun activity, include a fenced \`game\` block with JSON like:
  \`\`\`game
  {"type":"tic_tac_toe","title":"Tic-Tac-Toe","description":"Play directly in chat"}
  \`\`\`
  Allowed game types: \`tic_tac_toe\`, \`target_tap\`, \`number_hunt\`, \`memory_flip\`. If requested game is unsupported, suggest these available games.
`
    : '';
  const userInstructions = isListenMode
    ? `
Answer the user's question directly:
"${finalQuery}"

Language: ${options.language}
${contextStr ? `Context: ${contextStr}` : ''}${clarificationContext}${helpfulnessGuideline}

Reply in a conversational chat style that answers the user's question directly.
Narrative Style: ${options.narrationType}
${styleInstruction}

Rules:
- Respond only in ${options.language}. Never switch languages.
- Plain text only (no markdown, no tables, no emojis, no code blocks).
- For Realistic style: Provide factual, accurate, complete answers. Use web search data when provided. Be thorough but concise (3-8 sentences as needed).
- For Dramatic style: 2-5 engaging sentences with emotional depth.
- For Educational style: 3-6 clear sentences focusing on key learning points.
- For Personalized style: 3-7 sentences tailored to user profile context (interests, pulse, bio, age, location) without inventing facts.
- Keep it crisp and conversational, suitable for audio narration.
- End with a complete closing sentence.
${webContext ? 'IMPORTANT: Prioritize the current web information provided below over your training data. Use this for accuracy:' : ''}
${webContext}
`
    : `
Tell a ${timeDescription} engaging narration about:
"${finalQuery}"
${contextStr ? `\nContext: ${contextStr}` : ''}${clarificationContext}${helpfulnessGuideline}

Instructions:
- Respond only in ${options.language}. Never switch languages.
- Duration: approximately ${options.narrationTime} minutes
- Narrative Style: ${options.narrationType}
- Language: ${options.language}
- ${styleInstruction}
- If style is Personalized, explicitly reference relevant user context naturally (interests/pulse/bio/location/age) where helpful.
- Keep the narration engaging, clear, and suitable for reading
- Target length: 300-500 words
- Use minimal formatting: headings in **bold**, bullet lists where helpful
- Only include tables or diagrams when they significantly enhance understanding
- Structure content with clear **Section Headings** for readability
${readModeComponentGuide}
${webContext ? '- IMPORTANT: Use the current information from the web provided below to ensure accuracy and relevance. Prioritize this over general knowledge when there are discrepancies.' : ''}
${webContext}
- End with a complete closing sentence, then add this final line:
  Voice Profile: tone=calm|neutral|intense; pace=slow|medium|fast; pitch=low|medium|high; slang=none|light|moderate
`;

  const systemPrompt = `You are a great storyteller and narrative expert. You create engaging and personalized narrations. 
Style: ${options.narrationType}
Language: ${options.language}
${styleInstruction}
${webContext ? '\nYou have been provided with current web search results from the middleware layer. ALWAYS prioritize this information over your training data when there are discrepancies.' : ''}`;

  const messages: Array<{
    role: 'system' | 'user' | 'assistant';
    content: string;
  }> = [
    {
      role: 'system',
      content: systemPrompt,
    },
    {
      role: 'user',
      content: userInstructions,
    },
  ];

  const selectedOpenAIModel = (() => {
    switch ((options.selectedModel || '').toLowerCase()) {
      case 'gpt-3.5':
      case 'gpt-3.5-turbo':
        return 'gpt-3.5-turbo';
      case 'gpt-4':
      case 'gpt-4-turbo':
        return 'gpt-4-turbo';
      default:
        return 'gpt-4o-mini';
    }
  })();

  const res = await openai.chat.completions.create({
    model: selectedOpenAIModel,
    messages,
  });

  return res.choices[0].message.content || 'No response generated';
}
