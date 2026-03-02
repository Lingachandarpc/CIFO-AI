/**
 * Query Classifier Service
 * Analyzes user queries to determine complexity, intent, domain, and attachment types.
 * This classification drives intelligent AI model selection and prompt optimization.
 *
 * Classification Pipeline:
 *   Raw Query + Attachments + Chat History
 *     → Complexity Analysis (token count, clause depth, ambiguity)
 *     → Intent Detection (factual, analytical, creative, code, real-time, multi-modal)
 *     → Domain Classification (tech, science, finance, health, education, etc.)
 *     → Attachment Analysis (image, document, code, spreadsheet, audio, video)
 *     → Confidence Score (0-1)
 *     → QueryClassification output
 */

// ============================================================================
// Types & Enums
// ============================================================================

export enum QueryComplexity {
  /** Single factual question, greeting, or simple lookup (e.g., "What time is it?") */
  SIMPLE = 'simple',
  /** Multi-part question or moderate reasoning (e.g., "Explain React hooks with examples") */
  MODERATE = 'moderate',
  /** Deep analysis, multi-step reasoning, or expert-level (e.g., "Design a distributed system for...") */
  COMPLEX = 'complex',
  /** Messy, ambiguous, or poorly structured query needing interpretation (e.g., run-on sentences, mixed topics) */
  CLUTTERED = 'cluttered',
}

export enum QueryIntent {
  /** Simple fact lookup or definition */
  FACTUAL = 'factual',
  /** Requires reasoning, explanation, or analysis */
  ANALYTICAL = 'analytical',
  /** Creative writing, storytelling, brainstorming */
  CREATIVE = 'creative',
  /** Code generation, debugging, or technical implementation */
  CODE = 'code',
  /** Side-by-side comparison of concepts/products/ideas */
  COMPARISON = 'comparison',
  /** Casual chat, greeting, or conversational exchange */
  CONVERSATIONAL = 'conversational',
  /** Needs current/live data (time, weather, news, stock prices) */
  REAL_TIME = 'real_time',
  /** Involves processing images, documents, audio, or video */
  MULTI_MODAL = 'multi_modal',
  /** Step-by-step instructions or tutorial */
  INSTRUCTIONAL = 'instructional',
  /** Mathematical computation or data processing */
  MATHEMATICAL = 'mathematical',
  /** Translation or language-related task */
  TRANSLATION = 'translation',
  /** Summarization of long content */
  SUMMARIZATION = 'summarization',
}

export enum QueryDomain {
  TECHNOLOGY = 'technology',
  SCIENCE = 'science',
  FINANCE = 'finance',
  HEALTH = 'health',
  EDUCATION = 'education',
  CREATIVE_WRITING = 'creative_writing',
  PROGRAMMING = 'programming',
  BUSINESS = 'business',
  HISTORY = 'history',
  PSYCHOLOGY = 'psychology',
  MATHEMATICS = 'mathematics',
  LAW = 'law',
  NEWS_CURRENT_EVENTS = 'news_current_events',
  ENTERTAINMENT = 'entertainment',
  GENERAL = 'general',
}

export enum AttachmentType {
  IMAGE = 'image',
  DOCUMENT = 'document',
  CODE_FILE = 'code_file',
  SPREADSHEET = 'spreadsheet',
  AUDIO = 'audio',
  VIDEO = 'video',
  PDF = 'pdf',
  ARCHIVE = 'archive',
  UNKNOWN = 'unknown',
}

export interface AttachmentAnalysis {
  type: AttachmentType;
  name: string;
  sizeKB: number;
  mimeCategory: string;
  requiresVision: boolean;
  requiresOCR: boolean;
  requiresAudioProcessing: boolean;
  requiresVideoProcessing: boolean;
}

export interface QueryClassification {
  /** The original raw query */
  originalQuery: string;
  /** Cleaned/normalized query (trimmed, deduplicated whitespace) */
  normalizedQuery: string;
  /** Primary complexity level */
  complexity: QueryComplexity;
  /** Primary intent (strongest signal) */
  primaryIntent: QueryIntent;
  /** Secondary intents that may also apply */
  secondaryIntents: QueryIntent[];
  /** Detected domain */
  domain: QueryDomain;
  /** Attachment analysis results */
  attachments: AttachmentAnalysis[];
  /** Whether the query requires real-time/live data */
  requiresRealTime: boolean;
  /** Whether the query involves multi-modal input (vision, audio, etc.) */
  requiresMultiModal: boolean;
  /** Whether this is a follow-up in an ongoing conversation */
  isFollowUp: boolean;
  /** Estimated token count of the query */
  estimatedTokens: number;
  /** Whether the query needs long context window */
  requiresLongContext: boolean;
  /** Confidence score for classification (0-1) */
  confidence: number;
  /** Feature signals used for classification (for debugging/logging) */
  signals: QuerySignals;
}

export interface QuerySignals {
  wordCount: number;
  sentenceCount: number;
  questionMarkCount: number;
  hasCodeBlock: boolean;
  hasURL: boolean;
  hasNumbers: boolean;
  hasTechnicalTerms: boolean;
  hasAmbiguity: boolean;
  hasMultipleTopics: boolean;
  languageComplexity: 'basic' | 'intermediate' | 'advanced';
  topKeywords: string[];
}

// ============================================================================
// Feature Extraction Helpers
// ============================================================================

const TECHNICAL_TERMS = new Set([
  'api', 'algorithm', 'database', 'server', 'client', 'framework', 'library',
  'deploy', 'container', 'docker', 'kubernetes', 'microservice', 'architecture',
  'compile', 'runtime', 'debug', 'refactor', 'optimize', 'cache', 'middleware',
  'authentication', 'authorization', 'encryption', 'protocol', 'dns', 'ssl',
  'tcp', 'http', 'websocket', 'graphql', 'rest', 'crud', 'orm', 'sql',
  'nosql', 'redis', 'mongodb', 'postgres', 'react', 'nextjs', 'typescript',
  'javascript', 'python', 'java', 'rust', 'golang', 'swift', 'kotlin',
  'machine learning', 'neural network', 'deep learning', 'nlp', 'transformer',
  'embedding', 'fine-tune', 'training', 'inference', 'gpu', 'cuda', 'tensor',
  'regression', 'classification', 'clustering', 'reinforcement learning',
  'blockchain', 'smart contract', 'defi', 'nft', 'token', 'consensus',
  'cicd', 'devops', 'terraform', 'ansible', 'jenkins', 'github actions',
]);

const CODE_KEYWORDS = new Set([
  'function', 'class', 'import', 'export', 'const', 'let', 'var', 'return',
  'async', 'await', 'promise', 'callback', 'interface', 'type', 'enum',
  'try', 'catch', 'throw', 'for', 'while', 'if', 'else', 'switch', 'case',
  'npm', 'pip', 'cargo', 'yarn', 'pnpm', 'webpack', 'vite', 'rollup',
  'component', 'hook', 'useState', 'useEffect', 'useRef', 'props', 'state',
  'def', 'self', 'lambda', 'yield', 'decorator', 'abstract', 'override',
  'println', 'printf', 'cout', 'scanf', 'malloc', 'free', 'pointer',
  'struct', 'trait', 'impl', 'pub', 'mod', 'crate', 'macro',
  'bug', 'error', 'fix', 'debug', 'crash', 'undefined', 'null', 'NaN',
  'syntax error', 'type error', 'runtime error', 'compile error',
]);

const REAL_TIME_PATTERNS = [
  /\b(what|current|exact|latest|today['']?s?|right now|live|breaking)\b/i,
  /\b(time|date|weather|temperature|forecast|stock|price|score|news)\b/i,
  /\b(happening|trending|update|recent|this week|this month|this year)\b/i,
  /\b(IST|EST|PST|GMT|UTC|BST|CET|JST)\b/,
];

const CREATIVE_PATTERNS = [
  /\b(write|compose|create|craft|generate|imagine|invent|design)\b/i,
  /\b(story|poem|song|essay|script|novel|narrative|fiction|haiku|limerick)\b/i,
  /\b(brainstorm|ideas?|inspire|creative|artistic|imaginative)\b/i,
];

const COMPARISON_PATTERNS = [
  /\b(compare|vs\.?|versus|difference|similarities|better|worse|pros and cons)\b/i,
  /\b(which (one|is better)|prefer|alternative|tradeoff|between)\b/i,
];

const MATH_PATTERNS = [
  /\b(calculate|compute|solve|equation|formula|integral|derivative|matrix)\b/i,
  /\b(sum|product|average|median|probability|statistics|percentage)\b/i,
  /(\d+\s*[\+\-\*\/\^]\s*\d+)/,
  /\b(x\s*=|y\s*=|f\(x\)|dx|dy|∫|∑|∏|√)\b/,
];

const SUMMARIZE_PATTERNS = [
  /\b(summarize|summary|tldr|tl;?dr|brief|overview|recap|digest|gist)\b/i,
  /\b(key points|main (idea|point|takeaway)|in short|nutshell)\b/i,
];

const TRANSLATION_PATTERNS = [
  /\b(translate|translation|in (spanish|french|german|chinese|japanese|hindi|tamil|telugu|arabic|korean|portuguese|russian|italian))\b/i,
  /\b(how (do you|to) say .+ in)\b/i,
];

const INSTRUCTIONAL_PATTERNS = [
  /\b(how (to|do|can)|step[- ]by[- ]step|tutorial|guide|instructions?|walkthrough)\b/i,
  /\b(teach me|show me how|explain how|what are the steps)\b/i,
];

const AMBIGUITY_SIGNALS = [
  /\b(maybe|perhaps|possibly|kind of|sort of|idk|not sure|idk)\b/i,
  /\b(or something|stuff like that|things like|whatever|etc\.?|and more)\b/i,
  /\b(it|this|that|those|these)\b(?!\s+(is|are|was|were|will|can|should|would|might|could))/i,
];

const DOMAIN_KEYWORDS: Record<QueryDomain, RegExp[]> = {
  [QueryDomain.TECHNOLOGY]: [
    /\b(software|hardware|tech|computer|digital|AI|ML|cloud|SaaS|app|mobile|web|internet|browser|OS)\b/i,
  ],
  [QueryDomain.SCIENCE]: [
    /\b(physics|chemistry|biology|astronomy|geology|evolution|experiment|hypothesis|molecule|atom|quantum|relativity)\b/i,
  ],
  [QueryDomain.FINANCE]: [
    /\b(stock|investment|portfolio|market|crypto|bitcoin|trading|forex|mutual fund|dividend|interest rate|inflation|GDP|revenue|profit)\b/i,
  ],
  [QueryDomain.HEALTH]: [
    /\b(health|medical|disease|symptom|treatment|doctor|medicine|therapy|mental health|nutrition|exercise|diet|vaccine|hospital)\b/i,
  ],
  [QueryDomain.EDUCATION]: [
    /\b(learn|study|course|curriculum|exam|school|university|degree|lecture|homework|research paper|thesis|dissertation)\b/i,
  ],
  [QueryDomain.CREATIVE_WRITING]: [
    /\b(story|poem|novel|fiction|character|plot|narrative|screenplay|lyrics|prose|verse|literary)\b/i,
  ],
  [QueryDomain.PROGRAMMING]: [
    /\b(code|programming|developer|software engineer|fullstack|frontend|backend|devops|API|SDK|repo|git|branch|merge|pull request)\b/i,
  ],
  [QueryDomain.BUSINESS]: [
    /\b(startup|business|marketing|strategy|management|CEO|sales|customer|product|brand|revenue|KPI|ROI|B2B|B2C)\b/i,
  ],
  [QueryDomain.HISTORY]: [
    /\b(history|historical|century|war|civilization|empire|dynasty|ancient|medieval|renaissance|revolution|independence)\b/i,
  ],
  [QueryDomain.PSYCHOLOGY]: [
    /\b(psychology|behavior|cognitive|emotion|personality|therapy|counseling|anxiety|depression|motivation|consciousness|perception)\b/i,
  ],
  [QueryDomain.MATHEMATICS]: [
    /\b(math|algebra|geometry|calculus|statistics|probability|theorem|proof|equation|function|variable|limit|infinity)\b/i,
  ],
  [QueryDomain.LAW]: [
    /\b(law|legal|court|judge|lawyer|attorney|regulation|statute|constitution|rights|lawsuit|contract|intellectual property|patent)\b/i,
  ],
  [QueryDomain.NEWS_CURRENT_EVENTS]: [
    /\b(news|politics|election|government|policy|minister|president|parliament|UN|WHO|NATO|climate|protest|crisis)\b/i,
  ],
  [QueryDomain.ENTERTAINMENT]: [
    /\b(movie|film|music|game|gaming|anime|manga|TV|series|show|concert|celebrity|actor|singer|album|song|Netflix|Disney)\b/i,
  ],
  [QueryDomain.GENERAL]: [],
};

// Attachment MIME type classification
const MIME_TYPE_MAP: Record<string, AttachmentType> = {
  'image/jpeg': AttachmentType.IMAGE,
  'image/png': AttachmentType.IMAGE,
  'image/gif': AttachmentType.IMAGE,
  'image/webp': AttachmentType.IMAGE,
  'image/svg+xml': AttachmentType.IMAGE,
  'image/bmp': AttachmentType.IMAGE,
  'application/pdf': AttachmentType.PDF,
  'text/plain': AttachmentType.DOCUMENT,
  'text/markdown': AttachmentType.DOCUMENT,
  'text/csv': AttachmentType.SPREADSHEET,
  'application/vnd.ms-excel': AttachmentType.SPREADSHEET,
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': AttachmentType.SPREADSHEET,
  'application/msword': AttachmentType.DOCUMENT,
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': AttachmentType.DOCUMENT,
  'audio/mpeg': AttachmentType.AUDIO,
  'audio/wav': AttachmentType.AUDIO,
  'audio/ogg': AttachmentType.AUDIO,
  'audio/webm': AttachmentType.AUDIO,
  'video/mp4': AttachmentType.VIDEO,
  'video/webm': AttachmentType.VIDEO,
  'video/quicktime': AttachmentType.VIDEO,
  'application/zip': AttachmentType.ARCHIVE,
  'application/x-tar': AttachmentType.ARCHIVE,
  'application/gzip': AttachmentType.ARCHIVE,
};

const CODE_EXTENSIONS = new Set([
  'js', 'ts', 'jsx', 'tsx', 'py', 'java', 'cpp', 'c', 'rs', 'go',
  'rb', 'php', 'swift', 'kt', 'scala', 'r', 'sql', 'sh', 'bash',
  'yml', 'yaml', 'json', 'xml', 'html', 'css', 'scss', 'sass', 'less',
  'vue', 'svelte', 'astro', 'mdx', 'toml', 'ini', 'cfg', 'env',
  'dockerfile', 'makefile', 'cmake', 'gradle', 'pom',
]);

// ============================================================================
// Core Classification Functions
// ============================================================================

function estimateTokens(text: string): number {
  // Rough estimate: ~4 chars per token for English, ~2 for CJK/code
  const hasCJK = /[\u4e00-\u9faf\u3040-\u309f\u30a0-\u30ff\uac00-\ud7af]/.test(text);
  const charPerToken = hasCJK ? 2 : 4;
  return Math.ceil(text.length / charPerToken);
}

function extractSignals(query: string): QuerySignals {
  const words = query.split(/\s+/).filter(Boolean);
  const sentences = query.split(/[.!?]+/).filter(s => s.trim().length > 0);
  const lowerQuery = query.toLowerCase();
  const lowerWords = new Set(words.map(w => w.toLowerCase().replace(/[^a-z0-9-]/g, '')));

  const hasCodeBlock = /```[\s\S]*```/.test(query) || /`[^`]+`/.test(query);
  const hasURL = /https?:\/\/\S+/.test(query);
  const hasNumbers = /\d{2,}/.test(query);

  let technicalCount = 0;
  for (const term of TECHNICAL_TERMS) {
    if (term.includes(' ')) {
      if (lowerQuery.includes(term)) technicalCount++;
    } else {
      if (lowerWords.has(term)) technicalCount++;
    }
  }
  const hasTechnicalTerms = technicalCount >= 2;

  let ambiguityScore = 0;
  for (const pattern of AMBIGUITY_SIGNALS) {
    if (pattern.test(query)) ambiguityScore++;
  }
  const hasAmbiguity = ambiguityScore >= 2;

  // Detect multiple distinct topics (conjunction-separated clauses about different things)
  const conjunctions = query.split(/\b(and|also|plus|additionally|moreover|furthermore|then|after that)\b/i);
  const hasMultipleTopics = conjunctions.length >= 3;

  // Language complexity based on average word length and vocabulary diversity
  const avgWordLength = words.reduce((s, w) => s + w.length, 0) / (words.length || 1);
  const uniqueWords = new Set(words.map(w => w.toLowerCase()));
  const lexicalDiversity = uniqueWords.size / (words.length || 1);

  let languageComplexity: 'basic' | 'intermediate' | 'advanced' = 'basic';
  if (avgWordLength > 7 && lexicalDiversity > 0.8) {
    languageComplexity = 'advanced';
  } else if (avgWordLength > 5 || words.length > 20) {
    languageComplexity = 'intermediate';
  }

  // Extract top keywords (non-stop words)
  const STOP_WORDS = new Set([
    'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
    'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'shall',
    'should', 'may', 'might', 'must', 'can', 'could', 'i', 'me', 'my',
    'we', 'you', 'your', 'he', 'she', 'it', 'they', 'them', 'this',
    'that', 'these', 'those', 'what', 'which', 'who', 'when', 'where',
    'how', 'why', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by',
    'from', 'about', 'into', 'through', 'and', 'but', 'or', 'not', 'no',
    'so', 'if', 'then', 'than', 'too', 'very', 'just', 'also', 'some',
    'any', 'all', 'each', 'every', 'both', 'few', 'more', 'most', 'much',
    'many', 'such', 'own', 'same', 'other', 'only', 'here', 'there',
    'up', 'out', 'off', 'over', 'under', 'again', 'further', 'once',
  ]);

  const topKeywords = Array.from(uniqueWords)
    .filter(w => w.length > 2 && !STOP_WORDS.has(w))
    .slice(0, 10);

  return {
    wordCount: words.length,
    sentenceCount: sentences.length,
    questionMarkCount: (query.match(/\?/g) || []).length,
    hasCodeBlock,
    hasURL,
    hasNumbers,
    hasTechnicalTerms,
    hasAmbiguity,
    hasMultipleTopics,
    languageComplexity,
    topKeywords,
  };
}

function classifyComplexity(query: string, signals: QuerySignals, attachments: AttachmentAnalysis[]): QueryComplexity {
  const { wordCount, sentenceCount, hasCodeBlock, hasTechnicalTerms, hasAmbiguity, hasMultipleTopics, languageComplexity } = signals;

  // CLUTTERED: high ambiguity + multiple topics + poor structure
  if (hasAmbiguity && hasMultipleTopics && wordCount > 30) {
    return QueryComplexity.CLUTTERED;
  }

  // Also cluttered: very long with no clear structure
  if (wordCount > 100 && sentenceCount <= 2) {
    return QueryComplexity.CLUTTERED;
  }

  // Run-on with mixed questions
  if (signals.questionMarkCount >= 3 && hasMultipleTopics) {
    return QueryComplexity.CLUTTERED;
  }

  // COMPLEX: deep technical, multi-step, or long analytical queries
  if (hasCodeBlock && hasTechnicalTerms && wordCount > 30) {
    return QueryComplexity.COMPLEX;
  }
  if (languageComplexity === 'advanced' && wordCount > 40) {
    return QueryComplexity.COMPLEX;
  }
  if (hasTechnicalTerms && wordCount > 50) {
    return QueryComplexity.COMPLEX;
  }
  if (attachments.some(a => a.requiresVision || a.requiresOCR) && wordCount > 20) {
    return QueryComplexity.COMPLEX;
  }
  // Multi-step reasoning signal
  if (/(design|architect|build|implement|create.*system|optimize.*for|scale.*to)/i.test(query) && wordCount > 15) {
    return QueryComplexity.COMPLEX;
  }

  // MODERATE: multi-sentence, some complexity
  if (wordCount > 15 && sentenceCount >= 2) {
    return QueryComplexity.MODERATE;
  }
  if (hasTechnicalTerms && wordCount > 8) {
    return QueryComplexity.MODERATE;
  }
  if (hasCodeBlock) {
    return QueryComplexity.MODERATE;
  }
  if (attachments.length > 0) {
    return QueryComplexity.MODERATE;
  }

  // SIMPLE: short, single question, simple lookup
  return QueryComplexity.SIMPLE;
}

function classifyIntent(query: string, signals: QuerySignals, attachments: AttachmentAnalysis[]): { primary: QueryIntent; secondary: QueryIntent[] } {
  const intents: Array<{ intent: QueryIntent; score: number }> = [];
  const lower = query.toLowerCase();

  // MULTI_MODAL: attachments that need processing
  if (attachments.some(a => a.requiresVision || a.requiresOCR || a.requiresAudioProcessing || a.requiresVideoProcessing)) {
    intents.push({ intent: QueryIntent.MULTI_MODAL, score: 0.9 });
  }

  // REAL_TIME: needs current data
  let realTimeScore = 0;
  for (const pattern of REAL_TIME_PATTERNS) {
    if (pattern.test(query)) realTimeScore += 0.25;
  }
  if (realTimeScore > 0) {
    intents.push({ intent: QueryIntent.REAL_TIME, score: Math.min(realTimeScore, 1) });
  }

  // CODE: programming-related
  let codeScore = 0;
  if (signals.hasCodeBlock) codeScore += 0.5;
  const lowerWords = new Set(query.toLowerCase().split(/\s+/).map(w => w.replace(/[^a-z0-9-]/g, '')));
  for (const kw of CODE_KEYWORDS) {
    if (kw.includes(' ')) {
      if (lower.includes(kw)) codeScore += 0.1;
    } else {
      if (lowerWords.has(kw)) codeScore += 0.1;
    }
  }
  if (codeScore > 0.3) {
    intents.push({ intent: QueryIntent.CODE, score: Math.min(codeScore, 1) });
  }

  // CREATIVE
  let creativeScore = 0;
  for (const pattern of CREATIVE_PATTERNS) {
    if (pattern.test(query)) creativeScore += 0.35;
  }
  if (creativeScore > 0) {
    intents.push({ intent: QueryIntent.CREATIVE, score: Math.min(creativeScore, 1) });
  }

  // COMPARISON
  let comparisonScore = 0;
  for (const pattern of COMPARISON_PATTERNS) {
    if (pattern.test(query)) comparisonScore += 0.45;
  }
  if (comparisonScore > 0) {
    intents.push({ intent: QueryIntent.COMPARISON, score: Math.min(comparisonScore, 1) });
  }

  // MATHEMATICAL
  let mathScore = 0;
  for (const pattern of MATH_PATTERNS) {
    if (pattern.test(query)) mathScore += 0.35;
  }
  if (mathScore > 0) {
    intents.push({ intent: QueryIntent.MATHEMATICAL, score: Math.min(mathScore, 1) });
  }

  // SUMMARIZATION
  let summarizeScore = 0;
  for (const pattern of SUMMARIZE_PATTERNS) {
    if (pattern.test(query)) summarizeScore += 0.5;
  }
  if (summarizeScore > 0) {
    intents.push({ intent: QueryIntent.SUMMARIZATION, score: Math.min(summarizeScore, 1) });
  }

  // TRANSLATION
  let translationScore = 0;
  for (const pattern of TRANSLATION_PATTERNS) {
    if (pattern.test(query)) translationScore += 0.5;
  }
  if (translationScore > 0) {
    intents.push({ intent: QueryIntent.TRANSLATION, score: Math.min(translationScore, 1) });
  }

  // INSTRUCTIONAL
  let instructionalScore = 0;
  for (const pattern of INSTRUCTIONAL_PATTERNS) {
    if (pattern.test(query)) instructionalScore += 0.4;
  }
  if (instructionalScore > 0) {
    intents.push({ intent: QueryIntent.INSTRUCTIONAL, score: Math.min(instructionalScore, 1) });
  }

  // ANALYTICAL: reasoning-heavy
  if (/(why|cause|reason|explain|analyze|impact|effect|consequence|implication|because|how does)/i.test(lower)) {
    intents.push({ intent: QueryIntent.ANALYTICAL, score: 0.6 });
  }

  // FACTUAL: direct lookup
  if (/(what is|who is|when (did|was|is)|where is|define|meaning of|how (old|tall|many|much|long|far))/i.test(lower) && signals.wordCount < 15) {
    intents.push({ intent: QueryIntent.FACTUAL, score: 0.7 });
  }

  // CONVERSATIONAL: greetings, casual
  if (/(hello|hi|hey|howdy|good (morning|afternoon|evening)|thanks|thank you|bye|goodbye|sup|what's up)/i.test(lower) && signals.wordCount < 10) {
    intents.push({ intent: QueryIntent.CONVERSATIONAL, score: 0.8 });
  }

  // Sort by score descending
  intents.sort((a, b) => b.score - a.score);

  if (intents.length === 0) {
    return { primary: QueryIntent.FACTUAL, secondary: [] };
  }

  const primary = intents[0].intent;
  const secondary = intents.slice(1, 4).filter(i => i.score >= 0.3).map(i => i.intent);

  return { primary, secondary };
}

function classifyDomain(query: string, signals: QuerySignals): QueryDomain {
  const scores: Array<{ domain: QueryDomain; score: number }> = [];

  for (const [domain, patterns] of Object.entries(DOMAIN_KEYWORDS)) {
    if ((patterns as RegExp[]).length === 0) continue;
    let score = 0;
    for (const pattern of patterns as RegExp[]) {
      if (pattern.test(query)) score += 1;
    }
    if (score > 0) {
      scores.push({ domain: domain as QueryDomain, score });
    }
  }

  // Code-specific boost
  if (signals.hasCodeBlock) {
    const existing = scores.find(s => s.domain === QueryDomain.PROGRAMMING);
    if (existing) existing.score += 2;
    else scores.push({ domain: QueryDomain.PROGRAMMING, score: 2 });
  }

  scores.sort((a, b) => b.score - a.score);
  return scores.length > 0 ? scores[0].domain : QueryDomain.GENERAL;
}

function analyzeAttachment(file: {
  name: string;
  type: string;
  size?: number;
}): AttachmentAnalysis {
  const ext = file.name.split('.').pop()?.toLowerCase() || '';
  const mime = file.type.toLowerCase();
  const sizeKB = Math.round((file.size || 0) / 1024);

  // Determine type from MIME first, then extension
  let type = MIME_TYPE_MAP[mime] || AttachmentType.UNKNOWN;

  // Code file detection by extension
  if (type === AttachmentType.UNKNOWN && CODE_EXTENSIONS.has(ext)) {
    type = AttachmentType.CODE_FILE;
  }

  // Infer MIME category
  const mimeCategory = mime.split('/')[0] || 'unknown';

  return {
    type,
    name: file.name,
    sizeKB,
    mimeCategory,
    requiresVision: type === AttachmentType.IMAGE,
    requiresOCR: type === AttachmentType.PDF || type === AttachmentType.DOCUMENT,
    requiresAudioProcessing: type === AttachmentType.AUDIO,
    requiresVideoProcessing: type === AttachmentType.VIDEO,
  };
}

function detectFollowUp(
  query: string,
  chatHistory?: Array<{ role: string; content: string }>
): boolean {
  if (!chatHistory || chatHistory.length < 2) return false;

  const lower = query.toLowerCase();

  // Pronoun references to previous context
  if (/^(yes|no|ok|sure|right|exactly|correct|yep|nope|yeah|nah)\b/i.test(lower)) return true;
  if (/^(what about|how about|and|also|more|continue|go on|elaborate|tell me more)\b/i.test(lower)) return true;
  if (/\b(you (just|previously|earlier)|the (one|thing|topic) you (mentioned|said|talked))\b/i.test(lower)) return true;
  if (/\b(same (topic|thing|question)|follow[- ]up|regarding that|on that note)\b/i.test(lower)) return true;

  // Very short query after a conversation = likely follow-up
  if (query.split(/\s+/).length <= 5 && chatHistory.length >= 4) return true;

  return false;
}

function computeConfidence(
  signals: QuerySignals,
  complexity: QueryComplexity,
  primaryIntent: QueryIntent
): number {
  let confidence = 0.7; // Base confidence

  // Strong signal = higher confidence
  if (signals.wordCount >= 5 && signals.wordCount <= 50) confidence += 0.1;
  if (signals.sentenceCount >= 1 && signals.sentenceCount <= 5) confidence += 0.05;

  // Ambiguity lowers confidence
  if (signals.hasAmbiguity) confidence -= 0.15;
  if (signals.hasMultipleTopics) confidence -= 0.1;

  // Very short queries are less certain
  if (signals.wordCount <= 3) confidence -= 0.1;

  // Cluttered queries are inherently less certain
  if (complexity === QueryComplexity.CLUTTERED) confidence -= 0.1;

  // Strong intent signals boost confidence
  if (primaryIntent === QueryIntent.CODE && signals.hasCodeBlock) confidence += 0.1;
  if (primaryIntent === QueryIntent.CONVERSATIONAL && signals.wordCount < 5) confidence += 0.1;

  return Math.max(0.1, Math.min(1.0, confidence));
}

// ============================================================================
// Main Classifier
// ============================================================================

export function classifyQuery(
  query: string,
  options?: {
    attachments?: Array<{ name: string; type: string; size?: number }>;
    chatHistory?: Array<{ role: string; content: string }>;
  }
): QueryClassification {
  const normalized = query.replace(/\s+/g, ' ').trim();
  const attachments = (options?.attachments || []).map(analyzeAttachment);

  // Extract feature signals
  const signals = extractSignals(normalized);

  // Classify each dimension
  const complexity = classifyComplexity(normalized, signals, attachments);
  const { primary: primaryIntent, secondary: secondaryIntents } = classifyIntent(normalized, signals, attachments);
  const domain = classifyDomain(normalized, signals);
  const isFollowUp = detectFollowUp(normalized, options?.chatHistory);

  // Determine special requirements
  const requiresRealTime = primaryIntent === QueryIntent.REAL_TIME ||
    secondaryIntents.includes(QueryIntent.REAL_TIME);
  const requiresMultiModal = primaryIntent === QueryIntent.MULTI_MODAL ||
    secondaryIntents.includes(QueryIntent.MULTI_MODAL) ||
    attachments.some(a => a.requiresVision || a.requiresAudioProcessing || a.requiresVideoProcessing);

  const estimatedTokens = estimateTokens(normalized);
  const requiresLongContext = estimatedTokens > 3000 ||
    attachments.some(a => a.sizeKB > 500) ||
    !!(options?.chatHistory && options.chatHistory.length > 20);

  const confidence = computeConfidence(signals, complexity, primaryIntent);

  return {
    originalQuery: query,
    normalizedQuery: normalized,
    complexity,
    primaryIntent,
    secondaryIntents,
    domain,
    attachments,
    requiresRealTime,
    requiresMultiModal,
    isFollowUp,
    estimatedTokens,
    requiresLongContext,
    confidence,
    signals,
  };
}

export default classifyQuery;
