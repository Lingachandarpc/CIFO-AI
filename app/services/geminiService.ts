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
  },
  prefetchedWebResults?: SearchResult[] // NEW: Allow middleware to pass pre-fetched results
): Promise<{ narration: string; modelUsed: string }> {
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
      'Dramatic': 'Tell the story with dramatic flair, engaging tension, and emotional depth.',
      'Educational': 'Tell the story in an educational style, focusing on learning outcomes and key insights. For READ mode, actively use tables for comparisons, sliders for scales/ratings, tabs for organizing concepts, and thoughtful emojis (3-6) to highlight key points.',
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

    // READ mode format enhancements for Educational style
    const readModeFormatting = interactionMode === 'read' && narrationType === 'Educational'
      ? `
- **Emojis**: Use 3-6 thoughtful emojis throughout to highlight key concepts and add visual interest.
- **Charts**: Include charts for data visualization when appropriate using this format:
  \`\`\`json-chart
  {
    "type": "bar",
    "title": "Chart Title",
    "data": [{"name": "Item", "value": 100}, ...],
    "xAxisKey": "name",
    "yAxisKey": "value",
    "options": {"height": 300, "showLegend": true}
  }
  \`\`\`
  Chart types: "line" (trends), "bar" (comparisons), "pie" (proportions), "area" (cumulative)
  Use charts for: growth trends, statistical comparisons, market data, performance metrics, time series
- **Tables**: Use fenced code block labeled \`table\` (NO markdown pipe tables). Preferred JSON format:
  \`\`\`table
  {
    "title": "Comparison",
    "columns": ["Aspect", "Option A", "Option B"],
    "rows": [["Speed", "Fast", "Medium"], ["Cost", "High", "Low"]]
  }
  \`\`\`
- **Text Illustrations**: For processes, architectures, steps, or procedures, use text-based diagrams in code blocks labeled \`diagram\`. NO blank lines before code blocks.
- **Tabs**: Use tabbed sections in code block labeled \`tabs\`:
  \`\`\`tabs
  Tab: Label 1
  Content for first tab goes here
  Tab: Label 2
  Content for second tab goes here
  \`\`\`
  Each tab starts with "Tab: LabelName" on its own line.
- **Progress**: Use code block labeled \`progress\` for scales/ratings:
  \`\`\`progress
  label: Readiness
  value: 7/10
  left: Low
  right: High
  \`\`\`
- **Games (Nanobot)**: If the user asks to play a game, says they are bored, or requests fun activities, include a playable game block:
  \`\`\`game
  {"type":"tic_tac_toe","title":"Tic-Tac-Toe","description":"Play directly in chat"}
  \`\`\`
  Allowed game types: \`tic_tac_toe\`, \`target_tap\`, \`number_hunt\`, \`memory_flip\`. If the user asks an unsupported game, suggest these available games.
- **Structure**: Use **bold headings** to break content into scannable sections. NO blank lines between headings and their content.
- **DO NOT USE**: Markdown pipe table syntax (\`|\`, \`---\`) and multiple consecutive newlines (\\n\\n\\n...).
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

    const helpfulnessGuideline = '\n\nCRITICAL INSTRUCTIONS - YOU MUST FOLLOW THESE:\n1. NEVER EVER say "I don\'t have access to real-time data" or "I can\'t check the information" or "Check a news website"\n2. When you see **Current Time**: [time] in the context below, ONLY use it if the user explicitly asked about time or mentioned specific times\n3. NEVER add greeting like "Hey [Name], it\'s currently [time] IST in [city]" unless the user directly asked about time or greeting\n4. When you see web search results below, PRIORITIZE information from trusted local news sources (BBC, Reuters, AP News, country-specific outlets)\n5. For location-specific queries (movies, news, events): First verify the location context, then provide location-relevant information. Do NOT mention the time unless user asked about it\n6. For time questions: State the EXACT time shown in **Current Time**: field. Example: "It\'s currently 11:10 PM IST in Chennai"\n7. For time-contextual questions ("is it good time for coffee?"): First state the current time from **Current Time**: field, then give recommendation\n8. For news/current events: Use web search data from trusted sources and prioritize region-specific outlets over general ones. Do NOT include time greetings\n9. ALWAYS be solution-oriented and helpful - provide actual answers with sources, not excuses\n10. Location Context: If user is in specific region (India, USA, Tamil Nadu), validate that results are relevant to that location. If results are global/irrelevant, state ONLY verified local information\n11. REALISTIC STYLE LANGUAGE: For Realistic narrations, NEVER use opening phrases like "Picture this:", "Imagine this:", "Think of it this way:", "Let me paint a picture:", "Envision:", or "Let\'s say:". Instead, get directly to the point with factual, straightforward language.\n\nTypical schedules for context: coffee good in morning (6am-11am), lunch around noon-2pm, dinner 6pm-9pm, sleep 9pm-6am';

    const listenModeInstructions = interactionMode === 'listen'
      ? `
Answer the user's question directly:
"${finalQuery}"

Language: ${language}${clarificationContext}${helpfulnessGuideline}
${contextStr ? `Context: ${contextStr}` : ''}

Reply in a conversational chat style that answers the user's question directly.
Narrative Style: ${narrationType}
${styleInstruction}

Rules:
- Plain text only (no markdown, no tables, no emojis, no code blocks).
- For Realistic style: 2-5 sentences maximum. Be concise but complete. Prioritize web search data.
- For Dramatic style: 2-5 engaging sentences with emotional depth.
- For Educational style: 3-6 clear sentences focusing on key learning points.
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
${contextStr ? `\nContext: ${contextStr}` : ''}${clarificationContext}${helpfulnessGuideline}

Instructions:
- Narrative Style: ${narrationType}
- Language: ${language}
- ${styleInstruction}
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
    contents.push({
      role: 'user',
      parts: [{ text: listenModeInstructions }]
    });

    const apiUrl = `${GEMINI_API_BASE}/${GEMINI_MODEL}:generateContent?key=${apiKey}`;
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

    return { narration, modelUsed: 'gemini' };
  } catch (error) {
    console.error('Error generating narrative with Gemini:', error);
    return { 
      narration: 'Sorry — Gemini AI encountered an error.', 
      modelUsed: 'gemini' 
    };
  }
}
