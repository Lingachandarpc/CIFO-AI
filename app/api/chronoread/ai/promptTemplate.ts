type InteractionMode = "read" | "listen";

export interface PromptUserContext {
  profile?: {
    name?: string;
    age?: number | null;
    location?: string;
    interests?: string;
    pulse?: string;
    bio?: string;
  };
  recentQueries?: string[];
}

export interface PromptTemplateInput {
  query: string;
  category: string;
  language: string;
  interactionMode: InteractionMode;
  userContext?: PromptUserContext;
  chatHistory: Array<{ role: string; content: string }>;
}

const clean = (value?: string | null) => (value || "").trim();

const inferNeed = (query: string) => {
  const lower = query.toLowerCase();
  if (/(how|steps|plan|roadmap|implement|build)/.test(lower)) return "actionable";
  if (/(compare|vs|difference|best)/.test(lower)) return "comparative";
  if (/(why|cause|reason|explain)/.test(lower)) return "analytical";
  return "exploratory";
};

const isSimpleFactualQuery = (query: string) => {
  const lower = query.toLowerCase().trim();
  // Time/weather/date/simple facts - should get 2-line responses
  return /(what time|what's the time|current time|show me the time|what date|what day|weather|temperature|forecast|current weather)/.test(lower) ||
         (lower.length < 40 && /(when|where|who|what|define).*(is|are)/.test(lower));
};

const inferMood = (query: string, pulse?: string) => {
  const source = `${query} ${pulse || ""}`.toLowerCase();
  if (/(urgent|asap|quick|stress|anxious|panic)/.test(source)) return "time-sensitive";
  if (/(learn|study|understand|curious)/.test(source)) return "learning-focused";
  if (/(inspire|motivat|story|creative)/.test(source)) return "inspiration-seeking";
  return "balanced";
};

export function buildPromptTemplate(input: PromptTemplateInput) {
  const profile = input.userContext?.profile;
  const recentQueries = (input.userContext?.recentQueries || [])
    .map((value) => clean(value))
    .filter(Boolean)
    .slice(0, 6);

  const recencyStamp = new Intl.DateTimeFormat('en-US', {
    dateStyle: 'long',
    timeStyle: 'short',
  }).format(new Date());

  const historyTopics = input.chatHistory
    .filter((entry) => entry.role === "user")
    .map((entry) => clean(entry.content))
    .filter(Boolean)
    .slice(-6);

  const interestText = clean(profile?.interests);
  const pulseText = clean(profile?.pulse);
  const bioText = clean(profile?.bio);
  const need = inferNeed(input.query);
  const mood = inferMood(input.query, pulseText);
  const isSimpleQuery = isSimpleFactualQuery(input.query);
  
  const lengthGuidance = isSimpleQuery 
    ? 'IMPORTANT: Keep responses CONCISE (2-3 lines max) for simple factual questions like time, weather, definitions, or dates.' 
    : 'Provide comprehensive, well-structured responses adapted to the complexity of the question.';

  const sourceCoverageInstruction = `For evidence grounding, include source-oriented context from: books, journals/research, news/current affairs, web/social conversations, and practitioner/industry references. If a source bucket—especially books—is weak, immediately reinforce it with contemporary magazine features, investigative news, or verified web updates published around ${recencyStamp}. Only use "Not confidently available" when every adjacent signal truly lacks data, and never respond with "I couldn't find book references"—pivot to the freshest trustworthy material instead.`;

  const readModeEnhancement = input.interactionMode === "read"
    ? `
Read-mode formatting requirements - Use these elements ONLY when they naturally enhance the response:
- **Emojis**: Use thoughtfully (3-6 per response) to highlight key points, add personality, or improve scannability. Don't force them.
- **Tables**: Include Markdown tables when comparing data, listing features, or presenting structured information - HIGHLY RECOMMENDED for educational content.
- **Tabs**: Use tabbed blocks (fenced code block labeled \`tabs\`) for organizing distinct but related sections (e.g., "Beginner vs Advanced", "Theory vs Practice"). Format: "Tab: Label" on separate lines.
- **Sliders**: Use slider blocks (fenced code block labeled \`slider\`) to visualize scales, ratings, or spectrums. Include keys: label, value, left, right.
- **Diagrams**: Include text-based pictograms in fenced code blocks labeled \`diagram\` for processes, hierarchies, or relationships.
- **Charts/Data**: For numerical comparisons, trends, or statistics, use Markdown tables or ASCII charts in code blocks.

IMPORTANT: For Educational narration style, ACTIVELY include tables, sliders, tabs, and emojis to make content visually interesting rather than plain paragraphs.
DO NOT force-fit these elements into every response. Use them where they genuinely improve understanding, visual appeal, or information structure.
`
    : '';

  const outputContract = `${lengthGuidance}

Produce a naturally structured response with adaptive headings based on the user's query and context.
Use standard Markdown syntax throughout: **Heading Text** for all section headings, *text* for italic emphasis, ![alt text](image_url) for images, - for bullet points.
Format every heading with **double asterisks** - do not use plain text headings.
Keep structure clear but not template-like.
Place each **heading** on its own line and separate major sections with a blank line.
Include evidence-backed insights from books, journals/research, news/current signals, and web/social discourse when relevant.
Include relevant web images using Markdown image syntax when they add value to the explanation (skip for simple factual responses).
${isSimpleQuery ? 'For simple factual queries: Provide a direct 2-line answer. NO suggestions section.' : 'Include a **Summary** section near the end with 3-5 bullet points, and ensure the final sentence is complete (no abrupt cutoffs).'}
${readModeEnhancement}
${!isSimpleQuery ? 'End with one machine-parseable line:\nSuggested Next Topics: topic 1 | topic 2 | topic 3' : ''}`;

  const languageEnforcement = `You MUST respond only in ${input.language}. Do not include translations. Do not use English except for proper nouns. Keep the tags "Suggested Next Topics:" and "Voice Profile:" in English for machine parsing.`;

  const profileLines = [
    profile?.name ? `Name: ${profile.name}` : "",
    profile?.location ? `Location: ${profile.location}` : "",
    interestText ? `Interests: ${interestText}` : "",
    pulseText ? `Pulse: ${pulseText}` : "",
    bioText ? `Bio context: ${bioText}` : "",
  ].filter(Boolean);

  const contextClarification = (profile?.location || isSimpleQuery)
    ? ''
    : '\n- IMPORTANT: If the user query is ambiguous regarding location/context (like "What is the weather?" without specifying where), ask briefly for clarification before answering based on assumptions.';

  const personalizationInstruction = `Personalization profile (use softly, do not overfit):
- User need style: ${need}
- User mood signal: ${mood}
${profileLines.map((line) => `- ${line}`).join("\n")}
- Recent user topics: ${(recentQueries.length ? recentQueries : historyTopics).join(" | ") || "Not available"}
- Keep personalization subtle and helpful; prioritize factual quality and relevance.${contextClarification}`;

  const listenGuidance = `Anchor the narration in real, verifiable sources. Prioritize references from books, journals, news, web publications, and social discourse where relevant. Do not invent events, people, claims, or citations. If the query is vague, acknowledge ambiguity briefly and continue with grounded guidance.`;

  return {
    sourceCoverageInstruction,
    outputContract,
    languageEnforcement,
    personalizationInstruction,
    listenGuidance,
    isSimpleQuery,
  };
}
