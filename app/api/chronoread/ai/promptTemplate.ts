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

  const sourceCoverageInstruction = `For evidence grounding, include source-oriented context from: books, journals/research, news/current affairs, web/social conversations, and practitioner/industry references. If a source bucket—especially books—is weak, immediately reinforce it with contemporary magazine features, investigative news, or verified web updates published around ${recencyStamp}. Only use "Not confidently available" when every adjacent signal truly lacks data, and never respond with "I couldn't find book references"—pivot to the freshest trustworthy material instead.`;

  const readModeEnhancement = input.interactionMode === "read"
    ? `
Read-mode formatting requirements:
- Include at least one Markdown table with concrete data.
- Include one text-based pictogram in a fenced code block labeled \`diagram\`.
- Include one tabbed block in a fenced code block labeled \`tabs\`, using lines like "Tab: Label" to separate tabs.
- Include one slider block in a fenced code block labeled \`slider\` with keys: label, value, left, right.
- Add a few relevant emojis to guide scanning, but do not overuse them.
`
    : '';

  const outputContract = `Produce a naturally structured response with adaptive headings based on the user's query and context.
Use standard Markdown syntax throughout: **Heading Text** for all section headings, *text* for italic emphasis, ![alt text](image_url) for images, - for bullet points.
Format every heading with **double asterisks** - do not use plain text headings.
Keep structure clear but not template-like.
Place each **heading** on its own line and separate major sections with a blank line.
Include evidence-backed insights from books, journals/research, news/current signals, and web/social discourse when relevant.
Include relevant web images using Markdown image syntax when they add value to the explanation.
Include a **Summary** section near the end with 3-5 bullet points, and ensure the final sentence is complete (no abrupt cutoffs).
${readModeEnhancement}
End with one machine-parseable line:
Suggested Next Topics: topic 1 | topic 2 | topic 3`;

  const languageEnforcement = `You MUST respond only in ${input.language}. Do not include translations. Do not use English except for proper nouns. Keep the tags "Suggested Next Topics:" and "Voice Profile:" in English for machine parsing.`;

  const profileLines = [
    profile?.name ? `Name: ${profile.name}` : "",
    profile?.location ? `Location: ${profile.location}` : "",
    interestText ? `Interests: ${interestText}` : "",
    pulseText ? `Pulse: ${pulseText}` : "",
    bioText ? `Bio context: ${bioText}` : "",
  ].filter(Boolean);

  const personalizationInstruction = `Personalization profile (use softly, do not overfit):
- User need style: ${need}
- User mood signal: ${mood}
${profileLines.map((line) => `- ${line}`).join("\n")}
- Recent user topics: ${(recentQueries.length ? recentQueries : historyTopics).join(" | ") || "Not available"}
- Keep personalization subtle and helpful; prioritize factual quality and relevance.`;

  const listenGuidance = `Anchor the narration in real, verifiable sources. Prioritize references from books, journals, news, web publications, and social discourse where relevant. Do not invent events, people, claims, or citations. If the query is vague, acknowledge ambiguity briefly and continue with grounded guidance.`;

  return {
    sourceCoverageInstruction,
    outputContract,
    languageEnforcement,
    personalizationInstruction,
    listenGuidance,
  };
}
