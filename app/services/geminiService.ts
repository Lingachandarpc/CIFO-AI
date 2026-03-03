/**
 * Google Gemini Service with Web Search Integration
 * Fetches real-time web results via Tavily, then passes to Gemini for narration
 */

const GEMINI_MODEL = 'gemini-2.5-flash';
const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';
const TAVILY_API_URL = 'https://api.tavily.com/search';

interface SearchResult {
  title: string;
  url: string;
  content: string;
}

interface GeminiAttachment {
  id: string;
  name: string;
  size: number;
  type: string;
  base64?: string;
  tool?: string;
}

type GeminiPart = {
  text?: string;
  inlineData?: {
    mimeType: string;
    data: string;
  };
};

const SUPPORTED_ATTACHMENT_MIME_TYPES = new Set([
  'application/pdf',
  'text/plain',
  'text/csv',
  'application/json',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
]);

const MAX_GEMINI_ATTACHMENTS = 4;

function inferMimeTypeFromFileName(fileName?: string): string | null {
  if (!fileName) return null;
  const lower = fileName.toLowerCase();
  if (lower.endsWith('.pdf')) return 'application/pdf';
  if (lower.endsWith('.txt')) return 'text/plain';
  if (lower.endsWith('.csv')) return 'text/csv';
  if (lower.endsWith('.json')) return 'application/json';
  if (lower.endsWith('.doc')) return 'application/msword';
  if (lower.endsWith('.docx')) return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  if (lower.endsWith('.xls')) return 'application/vnd.ms-excel';
  if (lower.endsWith('.xlsx')) return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  if (lower.endsWith('.gif')) return 'image/gif';
  if (lower.endsWith('.webp')) return 'image/webp';
  return null;
}

function normalizeAttachmentMimeType(attachment: GeminiAttachment): string {
  const fromType = (attachment.type || '').trim().toLowerCase();
  if (fromType) return fromType;
  return inferMimeTypeFromFileName(attachment.name) || 'application/octet-stream';
}

function isSupportedGeminiAttachmentMimeType(mimeType: string): boolean {
  if (!mimeType) return false;
  if (mimeType.startsWith('image/')) return true;
  return SUPPORTED_ATTACHMENT_MIME_TYPES.has(mimeType);
}

function buildGeminiAttachmentParts(attachments: GeminiAttachment[] = []): {
  parts: GeminiPart[];
  summary: string;
} {
  if (!attachments.length) return { parts: [], summary: '' };

  const parts: GeminiPart[] = [];
  const acceptedNames: string[] = [];
  const skippedNames: string[] = [];

  for (const attachment of attachments.slice(0, MAX_GEMINI_ATTACHMENTS)) {
    if (!attachment?.base64) {
      skippedNames.push(attachment?.name || 'unnamed-file');
      continue;
    }

    const mimeType = normalizeAttachmentMimeType(attachment);
    if (!isSupportedGeminiAttachmentMimeType(mimeType)) {
      skippedNames.push(attachment.name || 'unnamed-file');
      continue;
    }

    acceptedNames.push(attachment.name || 'unnamed-file');
    parts.push({
      text: `Attachment: ${attachment.name || 'unnamed-file'} (${mimeType}). Use this file content as primary evidence when answering the user query.`,
    });
    parts.push({
      inlineData: {
        mimeType,
        data: attachment.base64,
      },
    });
  }

  if (attachments.length > MAX_GEMINI_ATTACHMENTS) {
    skippedNames.push(`${attachments.length - MAX_GEMINI_ATTACHMENTS} additional file(s) not sent (attachment limit ${MAX_GEMINI_ATTACHMENTS}).`);
  }

  const summarySegments: string[] = [];
  if (acceptedNames.length > 0) {
    summarySegments.push(`Attached files included: ${acceptedNames.join(', ')}`);
  }
  if (skippedNames.length > 0) {
    summarySegments.push(`Skipped attachments: ${skippedNames.join(', ')}`);
  }

  return {
    parts,
    summary: summarySegments.join('\n'),
  };
}

/**
 * Fetch real-time web search results from Tavily
 */
async function fetchWebSearchResults(query: string): Promise<SearchResult[]> {
  const tavilyKey = process.env.TAVILY_API_KEY;
  if (!tavilyKey) {
    console.warn('Tavily API key not set - web search disabled');
    return [];
  }

  try {
    const response = await fetch(TAVILY_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: tavilyKey,
        query,
        include_answer: true,
        max_results: 5,
        topic: 'news',
      }),
    });

    if (!response.ok) {
      console.warn('Tavily search failed:', response.status);
      return [];
    }

    interface TavilyResponse {
      results: Array<{
        title: string;
        url: string;
        content: string;
      }>;
    }

    const data = (await response.json()) as TavilyResponse;
    return data.results || [];
  } catch (error) {
    console.error('Error fetching web search results:', error);
    return [];
  }
}

/**
 * Format web search results for inclusion in prompt
 */
function formatSearchResults(results: SearchResult[]): string {
  if (!results.length) return '';

  const formatted = results
    .map((r, i) => `${i + 1}. **${r.title}** (${r.url})\n${r.content}`)
    .join('\n\n');

  return `\n## Current Web Information:\n${formatted}\n`;
}

/**
 * Detect simple factual queries that need short, direct responses
 */
function isSimpleFactualQuery(query: string): boolean {
  const lower = query.toLowerCase().trim();
  
  // Time/weather/date queries
  if (/(what time|what's the time|current time|show me the time|what date|what day|weather|temperature|forecast|current weather)/.test(lower)) {
    return true;
  }
  
  // Simple math/calculations
  if (/^(what is|what's|calculate|solve)\s+\d+/.test(lower)) return true;
  if (/^(how much|how many)\s+(is|are)\s+\d+/.test(lower)) return true;
  
  // Simple definitions (short queries only)
  if (lower.length < 40 && /(when|where|who|what|define).*(is|are)/.test(lower)) {
    return true;
  }
  
  return false;
}

/**
 * Check if query needs location/context clarification
 */
function needsLocationClarification(query: string, userLocation?: string): boolean {
  if (userLocation) return false; // User has location in profile
  
  const lower = query.toLowerCase().trim();
  // Weather queries without location specified
  if (/(weather|temperature|forecast|climate)/.test(lower) && !/(in|at|for)\s+[a-z]+/.test(lower)) {
    return true;
  }
  
  return false;
}

export async function generateNarrativeWithWebSearch(
  query: string,
  narrationTime: number,
  narrationType: string,
  language: string,
  interactionMode: 'read' | 'listen' = 'read',
  enableWebSearch: boolean = true,
  chatHistory: Array<{ role: string; content: string }> = [],
  userContext?: {
    profile?: {
      name?: string;
      age?: number | null;
      location?: string;
      interests?: string;
      pulse?: string;
      bio?: string;
    };
    recentQueries?: string[];
    attachments?: GeminiAttachment[];
  },
  prefetchedWebResults?: SearchResult[], // NEW: Allow middleware to pass pre-fetched results
  selectedModel?: string
): Promise<{ narration: string; modelUsed: string }> {
      const resolvedModel = (() => {
        const requested = (selectedModel || '').toLowerCase();
        if (requested === 'gemini-1.5-pro' || requested === 'gemini-pro') return 'gemini-1.5-pro';
        if (requested === 'gemini-1.5-flash' || requested === 'gemini-flash') return 'gemini-1.5-flash';
        return GEMINI_MODEL;
      })();

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return { narration: 'Gemini API key not configured', modelUsed: 'gemini' };
  }

  try {
    // Use pre-fetched results from middleware if provided, otherwise fetch from Tavily
    let searchContext = '';
    if (prefetchedWebResults && prefetchedWebResults.length > 0) {
      searchContext = formatSearchResults(prefetchedWebResults);
    } else if (enableWebSearch) {
      const searchResults = await fetchWebSearchResults(query);
      searchContext = formatSearchResults(searchResults);
    }

    const timeDescription = narrationTime <= 2 
      ? 'brief (under 2 minutes)' 
      : narrationTime <= 5 
        ? 'short (2-5 minutes)' 
        : 'medium-length (5+ minutes)';

    const narrativeStyleGuide: Record<string, string> = {
      'Realistic': 'Tell the story in a realistic, factual, and grounded manner with real-world examples.',
      'Practical': 'Use a practical advisory style: identify real-world use cases, ask missing diagnostic questions, compare options with trade-offs, and summarize an honest action plan grounded in books/research/journal evidence when available.',
      'Educational': 'Tell the story in an educational style, focusing on learning outcomes and key insights. In READ mode, use advanced formatting (tables/charts/tabs/progress/diagrams) only when it genuinely improves understanding.',
      'Personalized': 'Tailor the response to the user profile context (age, interests, personality pulse, bio, location) while staying factual and helpful.',
    };

    const styleInstruction = narrativeStyleGuide[narrationType] || narrativeStyleGuide['Realistic'];

    // Build context string from user profile
    let contextStr = '';
    if (userContext?.profile) {
      const p = userContext.profile;
      contextStr = [
        p.name && `User: ${p.name}`,
        p.age && `Age: ${p.age}`,
        p.location && `Location: ${p.location}`,
        p.interests && `Interests: ${p.interests}`,
        p.pulse && `Personality: ${p.pulse}`,
        p.bio && `Background: ${p.bio}`,
      ].filter(Boolean).join(', ');
    }

    // READ mode format guidance for Educational style (conditional, not mandatory)
    const readModeFormatting = interactionMode === 'read' && narrationType === 'Educational'
      ? `
- Keep the default output clean and readable with headings + bullets.
- Use advanced blocks (\`table\`, \`tabs\`, \`progress\`, \`json-chart\`, \`diagram\`) only when they add clear value for this specific answer.
- Do not force all markdown block types in a single response.
- Do not add emojis unless explicitly helpful.
`
      : '';

    // Detect simple queries and location needs
    const isSimple = isSimpleFactualQuery(query);
    const needsLocation = needsLocationClarification(query, userContext?.profile?.location);

    // Check if we're in a clarification flow
    const previousAssistantMsg = chatHistory.length >= 2 ? chatHistory[chatHistory.length - 2] : null;
    const isRespondingToClarification = previousAssistantMsg?.role === 'assistant' && 
      (previousAssistantMsg.content.includes('could you please specify') || 
       previousAssistantMsg.content.includes('Which ') ||
       previousAssistantMsg.content.includes('please provide'));

    // If location is ambiguous and we haven't already asked, ask for clarification
    if (needsLocation && !isRespondingToClarification) {
      return {
        narration: `To provide accurate ${/(weather|temperature|forecast)/.test(query.toLowerCase()) ? 'weather' : ''} information, could you please specify your location? For example: "weather in New York" or "temperature in London".`,
        modelUsed: 'gemini'
      };
    }

    // If responding to clarification, extract original question and combine with answer
    let finalQuery = query;
    if (isRespondingToClarification && chatHistory.length >= 3) {
      const originalQuestion = chatHistory[chatHistory.length - 3]?.content || query;
      // User's response is likely the clarification (location, specification, etc.)
      finalQuery = `${originalQuestion} ${query}`;
    }

    const clarificationContext = isRespondingToClarification && chatHistory.length >= 3
      ? '\n\nIMPORTANT: The user just provided clarification to your previous question. Use this information to answer their ORIGINAL question completely. Do not just acknowledge their response - provide the full answer they were seeking.'
      : '';

    const helpfulnessGuideline = '\n\nCRITICAL INSTRUCTIONS - YOU MUST FOLLOW THESE:\n1. NEVER EVER say "I don\'t have access to real-time data" or "I can\'t check the information" or "Check a news website"\n2. When you see **Current Time**: [time] in the context below, ONLY use it if the user explicitly asked about time or mentioned specific times\n3. Greeting rule: if you greet, use exactly "Hi {name}" and only once per ongoing session/topic. Never include location/city in the greeting.\n4. When you see web search results below, PRIORITIZE information from trusted local news sources (BBC, Reuters, AP News, country-specific outlets)\n5. For location-specific queries (movies, news, events): First verify the location context, then provide location-relevant information. Do NOT mention the time unless user asked about it\n6. For time questions: State the EXACT time shown in **Current Time**: field. Example: "It\'s currently 11:10 PM IST."\n7. For time-contextual questions ("is it good time for coffee?"): First state the current time from **Current Time**: field, then give recommendation\n8. For news/current events: Use web search data from trusted sources and prioritize region-specific outlets over general ones. Do NOT include time greetings\n9. ALWAYS be solution-oriented and helpful - provide actual answers with sources, not excuses\n10. Location Context: If user is in specific region (India, USA, Tamil Nadu), validate that results are relevant to that location. If results are global/irrelevant, state ONLY verified local information\n11. REALISTIC STYLE LANGUAGE: For Realistic narrations, NEVER use opening phrases like "Picture this:", "Imagine this:", "Think of it this way:", "Let me paint a picture:", "Envision:", or "Let\'s say:". Instead, get directly to the point with factual, straightforward language.\n\nTypical schedules for context: coffee good in morning (6am-11am), lunch around noon-2pm, dinner 6pm-9pm, sleep 9pm-6am';

    const attachmentPayload = buildGeminiAttachmentParts(userContext?.attachments || []);
    const attachmentContextText = attachmentPayload.summary
      ? `\n\nAttachment context:\n${attachmentPayload.summary}\n\nIf attachments are provided, prioritize information found in those files over assumptions.`
      : '';

    const listenModeInstructions = interactionMode === 'listen'
      ? `
Answer the user's question directly:
"${finalQuery}"

Language: ${language}${clarificationContext}${helpfulnessGuideline}${attachmentContextText}
${contextStr ? `Context: ${contextStr}` : ''}

Reply in a conversational chat style that answers the user's question directly.
Narrative Style: ${narrationType}
${styleInstruction}

Rules:
- Plain text only (no markdown, no tables, no emojis, no code blocks).
- For Realistic style: 2-5 sentences maximum. Be concise but complete. Prioritize web search data.
- For Practical style: If key details are missing, ask 2-5 targeted diagnostic questions first. If context is sufficient, provide options with pros/cons and a realistic action plan.
- For Educational style: 3-6 clear sentences focusing on key learning points.
- For Personalized style: 3-7 sentences tailored to known user profile fields (interests, pulse, bio, age, location).
- Keep it crisp and conversational, suitable for audio narration.
- End with a complete closing sentence.
${enableWebSearch && searchContext ? '\nIMPORTANT: Prioritize the current web information provided below over your training data. Use this for accuracy:' : ''}
${searchContext}
`
      : isSimple
        ? `
Answer this simple, direct question with a SHORT response (1-2 lines maximum):
"${query}"

Language: ${language}
${attachmentContextText}
${contextStr ? `Context: ${contextStr}` : ''}

Rules:
- MAXIMUM 1-2 short sentences. Be extremely concise.
- Answer ONLY what was asked, nothing more.
- NO explanations, NO suggestions, NO extra information.
- Use minimal formatting.
${enableWebSearch && searchContext ? '\nBased on the current web information provided below:' : ''}
${searchContext}
`
        : `
Tell an engaging narration about:
"${finalQuery}"
${contextStr ? `\nContext: ${contextStr}` : ''}${clarificationContext}${helpfulnessGuideline}${attachmentContextText}

Instructions:
- Narrative Style: ${narrationType}
- Language: ${language}
- ${styleInstruction}
- For Practical style: prioritize query-relevant real-world use cases and how people solved similar situations.
- For Practical style: include references from books, research papers, journals, or credible industry reports when available from web/attachment context. If not available, clearly state assumptions and do not fabricate citations.
- For Practical style: present decision choices (Option A/B/C), trade-offs, risks, and a practical recommendation.
- If style is Personalized, naturally reference relevant user profile context where appropriate.
${narrationType === 'Realistic' ? '- Length: 2-15 lines. Be comprehensive but concise.' : `- Duration: approximately ${narrationTime} minutes`}
- Keep the narration engaging, clear, and suitable for reading
- Use minimal formatting: headings in **bold**, bullet lists where helpful
- Only include tables or diagrams when they significantly enhance understanding
- Structure content with clear **Section Headings** for readability
${readModeFormatting}
${enableWebSearch && searchContext ? '- IMPORTANT: Use the current information from the web provided below to ensure accuracy and relevance. Prioritize this over your training data when there are discrepancies.' : ''}
${searchContext}
- End with a complete closing sentence
`;

    const systemPrompt = `You are a great storyteller and narrative expert. You create engaging and personalized narrations.
Style: ${narrationType}
Language: ${language}
${styleInstruction}
${enableWebSearch && searchContext ? '\nYou have been provided with current web search results. ALWAYS prioritize this information over your training data when there are discrepancies. If the query asks about current/recent information, use ONLY the web results provided.' : ''}`;

    // Build contents array with conversation history
    const contents = [];
    
    // Add system prompt as first user message
    contents.push({
      role: 'user',
      parts: [{ text: systemPrompt }]
    });
    contents.push({
      role: 'model',
      parts: [{ text: 'Understood. I will create engaging narratives following these guidelines.' }]
    });

    // Add chat history (last 5 messages)
    const recentHistory = chatHistory.slice(-5);
    for (const msg of recentHistory) {
      contents.push({
        role: msg.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: msg.content }]
      });
    }

    // Add current query
    const currentUserParts: GeminiPart[] = [{ text: listenModeInstructions }];
    if (attachmentPayload.parts.length > 0) {
      currentUserParts.push(...attachmentPayload.parts);
    }

    contents.push({
      role: 'user',
      parts: currentUserParts
    });

    const apiUrl = `${GEMINI_API_BASE}/${resolvedModel}:generateContent?key=${apiKey}`;
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents,
        generationConfig: {
          temperature: 0.7,
          topK: 40,
          topP: 0.95,
          maxOutputTokens: 4096,
        },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error');
      console.error('Gemini API error:', response.status, errorText);
      return { 
        narration: 'Sorry — Gemini AI is unavailable right now.', 
        modelUsed: 'gemini' 
      };
    }

    interface GeminiResponse {
      candidates: Array<{
        content: {
          parts: Array<{
            text: string;
          }>;
        };
      }>;
    }

    const data = (await response.json()) as GeminiResponse;
    const narration = data.candidates?.[0]?.content?.parts?.[0]?.text || '';

    return { narration, modelUsed: resolvedModel };
  } catch (error) {
    console.error('Error generating narrative with Gemini:', error);
    return { 
      narration: 'Sorry — Gemini AI encountered an error.', 
      modelUsed: selectedModel || 'gemini' 
    };
  }
}
