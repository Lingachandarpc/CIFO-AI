export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import type { Prisma } from "@prisma/client";
import { authOptions } from "../../../services/authOptions";
import prisma from "../../../../lib/prisma";
import {
  processQueryWithMiddleware,
  UserMindContext,
} from "../../../services/middlewareService";
import {
  geminiAdapter,
  claudeAdapter,
  xaiAdapter,
  openaiAdapter,
} from "../../../services/aiAdapters";
import {
  recordUserInteraction,
  analyzeAndUpdateInterests,
} from "../../../services/userService";
import { classifyQuery } from "../../../services/queryClassifier";
import {
  routeQuery,
  formatRoutingLog,
  resolveRoutingToLegacy,
} from "../../../services/modelRouter";
import { buildOptimizedPrompt } from "../../../services/promptTemplateEngine";

// All Tavily and context logic moved to middlewareService.ts

/**
 * Estimate token count from text (approx 1 token per 4 chars / 0.75 words)
 */
function estimateTokens(text: string): number {
  if (!text) return 0;
  return Math.ceil(text.length / 4);
}

/**
 * Estimate cost in USD based on model and token counts
 */
function estimateCost(model: string, promptTokens: number, completionTokens: number): number {
  // Cost per 1M tokens (input/output) - rough estimates
  const pricing: Record<string, { input: number; output: number }> = {
    'gpt-4-turbo': { input: 10, output: 30 },
    'gpt-4o-mini': { input: 0.15, output: 0.6 },
    'gpt-3.5-turbo': { input: 0.5, output: 1.5 },
    'claude-3-opus': { input: 15, output: 75 },
    'claude-3-sonnet': { input: 3, output: 15 },
    'claude-3-haiku': { input: 0.25, output: 1.25 },
    'gemini-1.5-pro': { input: 1.25, output: 5 },
    'gemini-1.5-flash': { input: 0.075, output: 0.3 },
    'gemini-2.5-flash': { input: 0.15, output: 0.6 },
    'grok-3': { input: 3, output: 15 },
  };
  const rate = pricing[model] || pricing['gemini-1.5-flash'];
  return (promptTokens * rate.input + completionTokens * rate.output) / 1_000_000;
}

/**
 * Extract user profile information from chat history
 */
function extractProfileFromHistory(
  chatHistory: Array<{ role: string; content: string }>,
  existingProfile?: {
    name?: string;
    age?: number | null;
    location?: string;
    interests?: string;
    pulse?: string;
    bio?: string;
  }
): typeof existingProfile {
  const profile = { ...existingProfile };
  
  // Get user messages
  const userMessages = chatHistory.filter(msg => msg.role === 'user').map(msg => msg.content);
  
  // ========================================================================
  // Extract LOCATION
  // ========================================================================
  if (!profile?.location && userMessages.length > 0) {
    for (const msg of userMessages) {
      const lower = msg.toLowerCase();
      
      // "I am from [location]", "I'm from [location]"
      const fromMatch = msg.match(/(?:i am|i'm|im)\s+from\s+([a-zA-Z\s]+?)(?:\.|,|$|\s+and|\s+in)/i);
      if (fromMatch) {
        profile.location = fromMatch[1].trim();
        break;
      }
      
      // "I live in [location]"
      const liveMatch = msg.match(/(?:i live|living)\s+in\s+([a-zA-Z\s]+?)(?:\.|,|$|\s+and)/i);
      if (liveMatch) {
        profile.location = liveMatch[1].trim();
        break;
      }
      
      // Direct city names (Chennai, Mumbai, Delhi, etc.)
      const cityMatch = msg.match(/\b(chennai|mumbai|delhi|bangalore|hyderabad|kolkata|pune|ahmedabad|jaipur|lucknow|new york|london|paris|tokyo|singapore|dubai|los angeles|san francisco|seattle|boston|chicago)\b/i);
      if (cityMatch && (lower.includes('weather') || lower.includes('time') || lower.includes('from') || lower.includes('in'))) {
        profile.location = cityMatch[1].trim();
        break;
      }
    }
  }
  
  // ========================================================================
  // Extract AGE
  // ========================================================================
  if (!profile?.age && userMessages.length > 0) {
    for (const msg of userMessages) {
      // "I am 25", "I'm 30 years old", "I am a 28-year-old"
      const ageMatch = msg.match(/(?:i am|i'm|im)\s+(?:a\s+)?(\d{1,2})(?:\s+years?\s+old|-year-old)?/i);
      if (ageMatch) {
        const age = parseInt(ageMatch[1], 10);
        if (age >= 10 && age <= 120) { // Reasonable age range
          profile.age = age;
          break;
        }
      }
      
      // "age is 25", "my age is 30"
      const ageIsMatch = msg.match(/(?:age|my age)\s+is\s+(\d{1,2})/i);
      if (ageIsMatch) {
        const age = parseInt(ageIsMatch[1], 10);
        if (age >= 10 && age <= 120) {
          profile.age = age;
          break;
        }
      }
    }
  }
  
  // ========================================================================
  // Extract PULSE (Personality Traits) - CUMULATIVE
  // ========================================================================
  const pulseTraits: string[] = [];
  
  for (const msg of userMessages) {
    // Personality descriptors: "I am creative", "I'm passionate about", "I love learning"
    const personalityPatterns = [
      /(?:i am|i'm|im)\s+(creative|curious|analytical|passionate|enthusiastic|dedicated|motivated|ambitious|hardworking|friendly|outgoing|introverted|extroverted|optimistic|pessimistic|adventurous|cautious|spontaneous|organized)/i,
      /(?:i love|i enjoy|i'm passionate about|i care about)\s+([^.,!?]+)/i,
      /(?:i value|i believe in|i prioritize)\s+([^.,!?]+)/i,
      /(?:my personality is|i would describe myself as)\s+([^.,!?]+)/i,
    ];
    
    for (const pattern of personalityPatterns) {
      const match = msg.match(pattern);
      if (match && match[1]) {
        const trait = match[1].trim();
        if (trait.length > 2 && trait.length < 100) {
          pulseTraits.push(trait);
        }
      }
    }
  }
  
  // Append new pulse traits to existing ones
  if (pulseTraits.length > 0) {
    const existingPulse = profile?.pulse || '';
    const existingTraits = existingPulse ? existingPulse.split(' | ') : [];
    const allTraits = [...existingTraits, ...pulseTraits];
    const uniqueTraits = Array.from(new Set(allTraits.map(t => t.toLowerCase())))
      .slice(0, 10); // Keep max 10 traits
    
    profile.pulse = allTraits
      .filter(t => uniqueTraits.includes(t.toLowerCase()))
      .join(' | ');
  }
  
  // ========================================================================
  // Extract BIO (Biographical Info) - CUMULATIVE
  // ========================================================================
  const bioFacts: string[] = [];
  
  for (const msg of userMessages) {
    // Occupation/Work: "I work as", "I am a developer", "I'm a teacher"
    const workMatch = msg.match(/(?:i work as|i am a|i'm a|my job is|i do)\s+(developer|engineer|teacher|doctor|nurse|designer|manager|consultant|analyst|scientist|researcher|student|professor|writer|artist|musician|chef|lawyer|accountant|entrepreneur|freelancer|[a-z\s]{3,30})/i);
    if (workMatch && workMatch[1]) {
      const occupation = workMatch[1].trim();
      if (occupation.length > 2 && occupation.length < 50) {
        bioFacts.push(`Works as ${occupation}`);
      }
    }
    
    // Education: "I study", "I'm studying", "I graduated from"
    const eduMatch = msg.match(/(?:i study|i'm studying|i studied|i graduated from|my degree is in)\s+([^.,!?]{3,50})/i);
    if (eduMatch && eduMatch[1]) {
      const education = eduMatch[1].trim();
      if (education.length > 2 && education.length < 50) {
        bioFacts.push(`Education: ${education}`);
      }
    }
    
    // Hobbies/Interests: "my hobby is", "in my free time I"
    const hobbyMatch = msg.match(/(?:my hobby is|my hobbies are|in my free time i|i like to)\s+([^.,!?]{3,50})/i);
    if (hobbyMatch && hobbyMatch[1]) {
      const hobby = hobbyMatch[1].trim();
      if (hobby.length > 2 && hobby.length < 50) {
        bioFacts.push(`Enjoys ${hobby}`);
      }
    }
  }
  
  // Append new bio facts to existing ones
  if (bioFacts.length > 0) {
    const existingBio = profile?.bio || '';
    const existingFacts = existingBio ? existingBio.split(' | ') : [];
    const allFacts = [...existingFacts, ...bioFacts];
    const uniqueFacts = Array.from(new Set(allFacts.map(f => f.toLowerCase())))
      .slice(0, 15); // Keep max 15 bio facts
    
    profile.bio = allFacts
      .filter(f => uniqueFacts.includes(f.toLowerCase()))
      .join(' | ');
  }
  
  return profile;
}

/**
 * Detect queries that require real-time web search (time, weather, etc.)
 */
function requiresWebSearch(query: string): boolean {
  const lower = query.toLowerCase().trim();
  
  // Time queries - comprehensive patterns
  if (/(what|what's|whats|tell me|what is|show me|check|get)\s+(the|current|exact|accurate)?\s*(time|date|day|today)/i.test(lower)) return true;
  if (/(time|date)\s+(is|in|at|now|right now)/i.test(lower)) return true;
  if (/(current|exact|accurate)\s+time/i.test(lower)) return true;
  if (/\b(IST|EST|PST|GMT|UTC)\b/i.test(lower) && /(time|now)/i.test(lower)) return true;
  
  // Weather queries
  if (/(weather|temperature|forecast|climate|rain|sunny|cloudy|hot|cold)/i.test(lower)) return true;
  
  // Current events
  if (/(latest|current|recent|today|now|breaking|news)/i.test(lower)) return true;
  
  return false;
}

/**
 * Detect if a query is a simple factual question that doesn't require web search
 * in realistic mode (straightforward answers from AI knowledge base)
 */
function isSimpleFactualQuestion(query: string): boolean {
  const lower = query.toLowerCase().trim();
  
  // NEVER skip web search for time/weather - these need real-time data
  if (requiresWebSearch(lower)) return false;
  
  // Simple mathematical questions
  if (/^(what is|what's|calculate|solve)\s+\d+/.test(lower)) return true;
  if (/^(how much|how many)\s+(is|are)\s+\d+/.test(lower)) return true;
  
  // Basic definitions
  if (/^(what is|what's|define|meaning of|what does)\s+\w+\s+(mean|definition)?/.test(lower) 
      && !/(latest|current|recent|today|now)/.test(lower)) return true;
  
  // Simple conversions
  if (/(convert|change|transform)\s+\d+/.test(lower)) return true;
  if (/(in|to)\s+(celsius|fahrenheit|meters|feet|kg|pounds|miles|km)/.test(lower)) return true;
  
  // Basic "how to" that are common knowledge
  if (/^how (do|to)\s+(i )?((spell|pronounce|say)|(\w{1,15}\s?){1,3})$/.test(lower) 
      && lower.length < 50) return true;
  
  return false;
}

function isDayOfWeekQuery(query: string): boolean {
  const lower = query.toLowerCase().trim();
  if (!lower) return false;

  // Exclude explanatory/definition style queries
  if (/(why|explain|meaning|define|definition|history|origin|how|difference)/i.test(lower)) {
    return false;
  }

  const englishPatterns = [
    /what\s+day\s+is\s+today/i,
    /which\s+day\s+is\s+today/i,
    /today\s+is\s+what\s+day/i,
    /day\s+today/i,
    /today\s+day/i,
  ];
  if (englishPatterns.some((pattern) => pattern.test(lower))) return true;

  const multilingualPatterns = [
    /(qué|que)\s+d[ií]a\s+es\s+hoy|hoy\s+.*(qué|que)\s+d[ií]a/i, // Spanish
    /(quel|quelle)\s+jour\s+.*aujourd['’]hui|aujourd['’]hui\s+.*(quel|quelle)\s+jour/i, // French
    /(welcher|welchen)\s+tag\s+.*heute|heute\s+.*(welcher|welchen)\s+tag/i, // German
    /(que|qual)\s+dia\s+[ée]\s+hoje|hoje\s+.*(que|qual)\s+dia/i, // Portuguese
    /今天.*(星期几|星期幾|周几|周幾|礼拜几|禮拜幾)|今天是?什么?日子/i, // Chinese
    /(今日|きょう).*(何曜日|なんようび)/i, // Japanese
    /(आज|aaj).*(कौन सा दिन|दिन|वार)/i, // Hindi
    /(இன்று|இன்னைக்கு).*(என்ன\s*கிழமை|என்ன\s*நாள்|கிழமை)/i, // Tamil
    /(ఈరోజు|ఇవాళ).*(ఏ\s*రోజు|ఏ\s*వారం|వారము)/i, // Telugu
    /(ഇന്ന്).*(എന്ത്\s*ദിവസം|എന്ത്\s*ദിനം|ആഴ്ച)/i, // Malayalam
    /(ಇಂದು).*(ಯಾವ\s*ದಿನ|ಯಾವ\s*ವಾರ)/i, // Kannada
    /(আজ).*(কোন\s*দিন|বার)/i, // Bengali
    /(आज).*(कोणता\s*दिवस|वार)/i, // Marathi
    /(આજે).*(કયો\s*દિવસ|વાર)/i, // Gujarati
    /(ਅੱਜ|ajj).*(ਕਿਹੜਾ\s*ਦਿਨ|ਵਾਰ)/i, // Punjabi
  ];

  return multilingualPatterns.some((pattern) => pattern.test(query));
}

function getLocaleFromLanguage(language: string): string {
  const map: Record<string, string> = {
    English: 'en-US',
    Spanish: 'es-ES',
    French: 'fr-FR',
    German: 'de-DE',
    Chinese: 'zh-CN',
    Japanese: 'ja-JP',
    Hindi: 'hi-IN',
    Portuguese: 'pt-PT',
    Tamil: 'ta-IN',
    Telugu: 'te-IN',
    Malayalam: 'ml-IN',
    Kannada: 'kn-IN',
    Bengali: 'bn-IN',
    Marathi: 'mr-IN',
    Gujarati: 'gu-IN',
    Punjabi: 'pa-IN',
  };
  return map[language] || 'en-US';
}

function formatDayOfWeekResponse(language: string, date: Date): string {
  const locale = getLocaleFromLanguage(language);
  const dayName = new Intl.DateTimeFormat(locale, { weekday: 'long' }).format(date);

  const templates: Record<string, string> = {
    English: `Today is ${dayName}.`,
    Spanish: `Hoy es ${dayName}.`,
    French: `Aujourd’hui, c’est ${dayName}.`,
    German: `Heute ist ${dayName}.`,
    Chinese: `今天是${dayName}。`,
    Japanese: `今日は${dayName}です。`,
    Hindi: `आज ${dayName} है।`,
    Portuguese: `Hoje é ${dayName}.`,
    Tamil: `இன்று ${dayName}.`,
    Telugu: `ఈరోజు ${dayName}.`,
    Malayalam: `ഇന്ന് ${dayName} ആണ്.`,
    Kannada: `ಇಂದು ${dayName}.`,
    Bengali: `আজ ${dayName}।`,
    Marathi: `आज ${dayName} आहे.`,
    Gujarati: `આજે ${dayName} છે.`,
    Punjabi: `ਅੱਜ ${dayName} ਹੈ।`,
  };

  return templates[language] || `Today is ${dayName}.`;
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function hasGreetingPrefix(text: string): boolean {
  return /^(hi|hello|hey)\b/i.test(text.trim());
}

function applyGreetingPolicy(
  narration: string,
  profileName: string | undefined,
  chatHistory: Array<{ role: string; content: string }>
): string {
  if (!narration) return narration;

  let normalized = narration.trimStart();
  const greetedEarlier = chatHistory.some(
    (msg) => msg.role === 'assistant' && hasGreetingPrefix(msg.content || '')
  );

  if (hasGreetingPrefix(normalized)) {
    if (greetedEarlier) {
      normalized = normalized
        .replace(/^(hi|hello|hey)\s+[^,\n.!?]+[,:!\-\s]*/i, '')
        .trimStart();
    } else {
      const preferredName = (profileName || '').trim();
      if (preferredName) {
        normalized = normalized.replace(
          /^(hi|hello|hey)\s+[^,\n.!?]+(?:\s*,\s*in\s+[^,\n.!?]+)?[,:!\-\s]*/i,
          `Hi ${preferredName}, `
        );
      } else {
        normalized = normalized.replace(
          /^(hi|hello|hey)\s+[^,\n.!?]+(?:\s*,\s*in\s+[^,\n.!?]+)?[,:!\-\s]*/i,
          'Hi, '
        );
      }
    }
  }

  if (profileName?.trim()) {
    const safeName = escapeRegex(profileName.trim());
    normalized = normalized.replace(
      new RegExp(`^for\\s+${safeName}\\s*,\\s*in\\s+[^,\\n.!?]+[,:!\\-\\s]*`, 'i'),
      ''
    );
  }

  // Never keep ", in <city>" as part of opening greeting
  normalized = normalized.replace(
    /^(Hi\s+[^,\n.!?]+),\s*in\s+[^,\n.!?]+([,:!\-\s]*)/i,
    '$1$2'
  );

  return normalized.trimStart();
}

export async function POST(req: Request) {
  try {
    const {
      query,
      narrationTime,
      narrationType,
      language,
      interactionMode = "read",
      aiModel = "auto",
      selectedModel,
      enableWebSearch = true,
      userContext,
      chatHistory = [],
    } = await req.json();

    // ========================================================================
    // Freemium Token Budget Check
    // ========================================================================
    try {
      const budgetSession = await getServerSession(authOptions);
      if (budgetSession?.user?.email) {
        const budgetUser = await prisma.user.findUnique({
          where: { email: budgetSession.user.email },
          select: { tokenBudget: true, tokensUsed: true, tier: true, periodStart: true },
        });
        if (budgetUser) {
          // Auto-reset monthly period
          const now = new Date();
          const periodStart = new Date(budgetUser.periodStart);
          const monthsDiff = (now.getFullYear() - periodStart.getFullYear()) * 12 + (now.getMonth() - periodStart.getMonth());
          if (monthsDiff >= 1) {
            await prisma.user.update({
              where: { email: budgetSession.user.email },
              data: { tokensUsed: 0, periodStart: now },
            });
            budgetUser.tokensUsed = 0;
          }
          // Block if over budget
          if (budgetUser.tokensUsed >= budgetUser.tokenBudget) {
            return NextResponse.json({
              error: "Monthly token limit reached. Upgrade to continue.",
              tokenBudgetExceeded: true,
              tier: budgetUser.tier,
              tokensUsed: budgetUser.tokensUsed,
              tokenBudget: budgetUser.tokenBudget,
            }, { status: 429 });
          }
        }
      }
    } catch {
      // Don't block on budget check failures
    }

    const parsedNarrationTime =
      typeof narrationTime === "number" ? narrationTime : Number(narrationTime);
    const resolvedNarrationTime = Number.isFinite(parsedNarrationTime)
      ? parsedNarrationTime
      : 1.5;

    // Fast path: day-of-week queries should always be concise in every language
    if (isDayOfWeekQuery(query)) {
      const dayLine = formatDayOfWeekResponse(language || 'English', new Date());
      return NextResponse.json({
        narration: dayLine,
        referencesHtml: undefined,
        modelUsed: 'gemini',
        tokenUsage: {
          promptTokens: 0,
          completionTokens: 0,
          totalTokens: 0,
          estimatedCost: 0,
        },
      });
    }

    // ========================================================================
    // Realistic Mode Optimization: Skip web search for simple factual questions
    // BUT ALWAYS FORCE enable for time/weather/current events
    // ========================================================================
    const needsRealTimeData = requiresWebSearch(query);
    const isRealisticMode = narrationType === 'Realistic';
    const shouldSkipWebSearch = !needsRealTimeData && isRealisticMode && isSimpleFactualQuestion(query);
    
    // CRITICAL: Force web search for time/weather queries, ignore client setting
    const finalEnableWebSearch = needsRealTimeData 
      ? true  // ALWAYS true for time/weather, override client
      : (shouldSkipWebSearch ? false : enableWebSearch);

    // ========================================================================
    // Build User Mind Context (middleware-ready)
    // ========================================================================

    // Server-side: Load authoritative profile + recent chat history from DB
    // This supplements (and may override) whatever the client sent
    let dbProfile: Record<string, unknown> | null = null;
    let dbChatHistory: Array<{ role: string; content: string }> = [];
    let dbInsight: Record<string, unknown> | null = null;
    try {
      const profileSession = await getServerSession(authOptions);
      if (profileSession?.user?.email) {
        const dbUser = await prisma.user.findUnique({
          where: { email: profileSession.user.email },
          select: { id: true },
        });
        if (dbUser) {
          // Load persisted profile
          const profile = await prisma.userProfile.findUnique({
            where: { userId: dbUser.id },
          });
          if (profile) {
            dbProfile = {
              location: profile.location,
              interests: profile.interests,
              pulse: profile.pulse,
              bio: profile.bio,
              age: profile.age,
              questionTypes: profile.questionTypes,
              preferredLength: profile.preferredLength,
            };
          }
          // Load recent chat history from DB (last 10 messages) to enrich context
          const recentChats = await prisma.chatHistory.findMany({
            where: { userId: dbUser.id },
            orderBy: { timestamp: 'desc' },
            take: 10,
            select: { role: true, content: true },
          });
          if (recentChats.length > 0) {
            dbChatHistory = recentChats.reverse().map((c) => ({ role: c.role, content: c.content }));
          }
          // Load user insights for additional personalization
          const insight = await prisma.userInsight.findUnique({
            where: { userId: dbUser.id },
          });
          if (insight) {
            dbInsight = {
              topTopics: insight.topTopics,
              preferredMode: insight.preferredMode,
              preferredVoice: insight.preferredVoice,
              likeCount: insight.likeCount,
              dislikeCount: insight.dislikeCount,
            };
          }
        }
      }
    } catch (err) {
      console.error('Error loading server-side user context:', err);
    }

    // Merge: prefer DB profile over client-sent profile, use DB chat history as fallback
    const mergedProfile = {
      ...(dbProfile || {}),
      ...(userContext?.profile || {}),
      // DB values win for fields the client might not have
      ...(dbProfile?.interests ? { interests: dbProfile.interests } : {}),
      ...(dbProfile?.location ? { location: dbProfile.location } : {}),
      ...(dbProfile?.bio ? { bio: dbProfile.bio } : {}),
      ...(dbProfile?.age ? { age: dbProfile.age } : {}),
      // Add insight-based personalization
      ...(dbInsight?.topTopics ? { topTopics: dbInsight.topTopics } : {}),
      ...(dbInsight?.preferredMode ? { preferredMode: dbInsight.preferredMode } : {}),
    };
    
    // Use DB chat history if client didn't send enough context
    const mergedChatHistory = chatHistory.length >= 3 ? chatHistory : (dbChatHistory.length > 0 ? dbChatHistory : chatHistory);

    // Extract location and other profile info from chat history if not in profile
    const extractedProfile = extractProfileFromHistory(mergedChatHistory, mergedProfile);
    
    // Debug logging for time queries
    if (needsRealTimeData) {
      console.log('🕐 TIME QUERY DETECTED:', {
        query,
        needsRealTimeData,
        finalEnableWebSearch,
        location: extractedProfile?.location || userContext?.profile?.location
      });
    }
    
    // Save extracted profile to database if user is authenticated
    // Check if ANY profile field was extracted
    const hasNewProfileData = 
      (extractedProfile?.location && extractedProfile.location !== userContext?.profile?.location) ||
      (extractedProfile?.age && extractedProfile.age !== userContext?.profile?.age) ||
      (extractedProfile?.pulse && extractedProfile.pulse !== userContext?.profile?.pulse) ||
      (extractedProfile?.bio && extractedProfile.bio !== userContext?.profile?.bio);
    
    if (hasNewProfileData) {
      try {
        const session = await getServerSession(authOptions);
        if (session?.user?.email) {
          // Get user ID from email
          const user = await prisma.user.findUnique({
            where: { email: session.user.email },
            select: { id: true }
          });
          
          if (user) {
            // Build update data - only include fields that were extracted
            const updateData: Prisma.UserProfileUpdateInput = {};
            const createData: Prisma.UserProfileUncheckedCreateInput = { userId: user.id };
            
            if (extractedProfile?.location) {
              updateData.location = extractedProfile.location;
              createData.location = extractedProfile.location;
            }
            
            if (extractedProfile?.age) {
              updateData.age = extractedProfile.age;
              createData.age = extractedProfile.age;
            }
            
            if (extractedProfile?.pulse) {
              updateData.pulse = extractedProfile.pulse;
              createData.pulse = extractedProfile.pulse;
            }
            
            if (extractedProfile?.bio) {
              updateData.bio = extractedProfile.bio;
              createData.bio = extractedProfile.bio;
            }
            
            // Update or create UserProfile with all extracted fields
            await prisma.userProfile.upsert({
              where: { userId: user.id },
              update: updateData,
              create: createData
            });
          }
        }
      } catch (error) {
        console.error('Error saving profile data:', error);
        // Continue even if save fails
      }
    }
    
    const userMindContext: UserMindContext = {
      profile: extractedProfile,
      mood: userContext?.mood || {
        current: "curious",
        energy: "medium",
        preferences: [],
      },
      recentQueries: userContext?.recentQueries || [],
      learningHistory: userContext?.learningHistory || [],
    };

    // ========================================================================
    // SMART MODEL ROUTING: Classify → Route → Optimize Prompt
    // ========================================================================
    type AdapterOptions = {
      narrationTime: number;
      narrationType: string;
      language: string;
      interactionMode: 'read' | 'listen';
      selectedModel?: string;
    };

    // Step 1: Classify the query (complexity, intent, domain, attachments)
    const queryClassification = classifyQuery(query, {
      attachments: userContext?.attachments?.map((a: { name: string; type: string; size?: number }) => ({
        name: a.name,
        type: a.type,
        size: a.size,
      })),
      chatHistory: mergedChatHistory,
    });

    // Step 2: Route to optimal model using intelligent scoring
    const routingDecision = routeQuery(queryClassification, {
      aiModel,
      selectedModel,
    });

    // Log the routing decision for debugging
    console.log(formatRoutingLog(routingDecision));

    // Step 3: Build optimized prompt template for the selected model
    const optimizedPrompt = buildOptimizedPrompt(queryClassification, {
      userProfile: extractedProfile,
      mood: userMindContext.mood ? {
        current: userMindContext.mood.current,
        energy: userMindContext.mood.energy,
      } : undefined,
      chatHistory: mergedChatHistory,
      language,
      narrationType,
      interactionMode,
      targetProvider: routingDecision.provider,
    });

    // Resolve to legacy format for backward compatibility
    const resolvedSelection = resolveRoutingToLegacy(routingDecision);

    // Helper: map provider name to adapter function
    const getAdapter = (provider: string): typeof geminiAdapter => {
      switch (provider) {
        case 'google': return geminiAdapter;
        case 'anthropic': return claudeAdapter;
        case 'xai': return xaiAdapter;
        case 'openai': return openaiAdapter;
        default: return openaiAdapter;
      }
    };

    const adapterOptions: AdapterOptions = {
      narrationTime: resolvedNarrationTime,
      narrationType,
      language,
      interactionMode,
      selectedModel: resolvedSelection.model,
    };

    const middlewareOptions = {
      narrationTime: resolvedNarrationTime,
      narrationType,
      language,
      interactionMode,
      enableWebSearch: finalEnableWebSearch,
      userContext: userMindContext,
      chatHistory: mergedChatHistory,
    };

    // ========================================================================
    // Process through Middleware Layer (with fallback on adapter failure)
    // ========================================================================
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let enhancedResponse: Awaited<ReturnType<typeof processQueryWithMiddleware>> = undefined as any;
    let modelName = resolvedSelection.model;

    try {
      const selectedAdapter = getAdapter(resolvedSelection.provider);
      enhancedResponse = await processQueryWithMiddleware(
        query,
        (enrichedQuery, context) =>
          selectedAdapter(enrichedQuery, context, adapterOptions),
        middlewareOptions,
      );
    } catch (primaryError) {
      // Primary adapter failed — try alternatives from the routing decision
      console.warn(`⚠️ Primary adapter (${resolvedSelection.provider}/${resolvedSelection.model}) failed:`, primaryError);

      let fallbackSucceeded = false;
      for (const alt of routingDecision.alternatives) {
        try {
          const altAdapter = getAdapter(alt.provider);
          const altSelection = { provider: alt.provider, model: alt.model };
          console.log(`🔄 Trying fallback: ${alt.displayName} (${altSelection.provider}/${altSelection.model})`);

          enhancedResponse = await processQueryWithMiddleware(
            query,
            (enrichedQuery, context) =>
              altAdapter(enrichedQuery, context, {
                ...adapterOptions,
                selectedModel: altSelection.model,
              }),
            middlewareOptions,
          );

          modelName = altSelection.model;
          fallbackSucceeded = true;
          console.log(`✅ Fallback succeeded with ${alt.displayName}`);
          break;
        } catch (fallbackError) {
          console.warn(`⚠️ Fallback ${alt.displayName} also failed:`, fallbackError);
        }
      }

      if (!fallbackSucceeded) {
        console.error('❌ All AI adapters failed');
        return NextResponse.json(
          { error: "All AI models failed to generate a response" },
          { status: 503 }
        );
      }
    }

    enhancedResponse.narration = applyGreetingPolicy(
      enhancedResponse.narration,
      typeof extractedProfile?.name === 'string' ? extractedProfile.name : undefined,
      mergedChatHistory
    );

    // ========================================================================
    // Estimate Token Usage
    // ========================================================================
    const promptTokens = estimateTokens(optimizedPrompt.systemPrompt + query);
    const completionTokens = estimateTokens(enhancedResponse.narration);
    const totalTokens = promptTokens + completionTokens;
    const estimatedCostUsd = estimateCost(modelName, promptTokens, completionTokens);

    // ========================================================================
    // Record User Interaction, Token Usage & Update Interests
    // ========================================================================
    let tokenBudgetExceeded = false;
    try {
      const session = await getServerSession(authOptions);
      if (session?.user?.email) {
        const user = await prisma.user.findUnique({
          where: { email: session.user.email },
          select: { id: true, tokenBudget: true, tokensUsed: true },
        });
        
        if (user) {
          // Record this query in interaction history
          const responseLength = enhancedResponse.narration.split(/\s+/).length;
          await recordUserInteraction(user.id, query, responseLength);

          // Record token usage and update running total
          try {
            await prisma.$transaction([
              prisma.tokenUsageLog.create({
                data: {
                  userId: user.id,
                  model: modelName,
                  promptTokens,
                  completionTokens,
                  totalTokens,
                  estimatedCost: estimatedCostUsd,
                  queryType: "text",
                },
              }),
              prisma.user.update({
                where: { id: user.id },
                data: { tokensUsed: { increment: totalTokens } },
              }),
            ]);
          } catch (tokenErr) {
            console.error('Token recording failed:', tokenErr);
          }

          // Check if budget exceeded
          tokenBudgetExceeded = (user.tokensUsed + totalTokens) > user.tokenBudget;
          
          // Analyze and update interests every 5th query
          const interactionCount = await prisma.userInteractionHistory.count({
            where: {
              profile: {
                userId: user.id,
              },
            },
          });
          
          if (interactionCount % 5 === 0) {
            analyzeAndUpdateInterests(user.id).catch(err => 
              console.error('Background interest analysis failed:', err)
            );
          }
        }
      }
    } catch (trackingError) {
      console.error('Error tracking user interaction:', trackingError);
    }

    // ========================================================================
    // Return Enhanced Response
    // ========================================================================
    return NextResponse.json({
      narration: enhancedResponse.narration,
      referencesHtml: enhancedResponse.referencesHtml,
      modelUsed: modelName,
      webSources: enhancedResponse.webSources,
      contextApplied: enhancedResponse.contextApplied,
      tokenUsage: {
        promptTokens,
        completionTokens,
        totalTokens,
        estimatedCost: estimatedCostUsd,
      },
      tokenBudgetExceeded,
      metadata: {
        ...enhancedResponse.metadata,
        // Smart routing metadata
        routing: {
          complexity: queryClassification.complexity,
          intent: queryClassification.primaryIntent,
          domain: queryClassification.domain,
          selectedModel: routingDecision.selected.displayName,
          routingScore: routingDecision.selected.score,
          routingConfidence: routingDecision.confidence,
          promptComplexity: optimizedPrompt.metadata.complexity,
          suggestedTemperature: optimizedPrompt.suggestedTemperature,
        },
      },
    });
  } catch (err) {
    console.error("❌ AI API error:", err);
    return NextResponse.json(
      { error: "AI generation failed" },
      { status: 500 }
    );
  }
}
