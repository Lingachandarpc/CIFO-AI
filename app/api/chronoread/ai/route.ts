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

// All Tavily and context logic moved to middlewareService.ts

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

export async function POST(req: Request) {
  try {
    const {
      query,
      narrationTime,
      narrationType,
      language,
      interactionMode = "read",
      aiModel = "auto",
      enableWebSearch = true,
      userContext,
      chatHistory = [],
    } = await req.json();

    const parsedNarrationTime =
      typeof narrationTime === "number" ? narrationTime : Number(narrationTime);
    const resolvedNarrationTime = Number.isFinite(parsedNarrationTime)
      ? parsedNarrationTime
      : 1.5;

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
    
    // Extract location and other profile info from chat history if not in profile
    const extractedProfile = extractProfileFromHistory(chatHistory, userContext?.profile);
    
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
    // Select AI Adapter based on model choice
    // ========================================================================
    type AdapterOptions = {
      narrationTime: number;
      narrationType: string;
      language: string;
      interactionMode: 'read' | 'listen';
    };

    let selectedAdapter: (
      enrichedQuery: string,
      context: import('../../../services/middlewareService').MiddlewareContext,
      options: AdapterOptions
    ) => Promise<string>;
    let modelName: string;

    switch (aiModel) {
      case "gemini":
        selectedAdapter = geminiAdapter;
        modelName = "gemini";
        break;
      case "claude-sonnet":
        selectedAdapter = claudeAdapter;
        modelName = "claude";
        break;
      case "xai":
        selectedAdapter = xaiAdapter;
        modelName = "xai";
        break;
      case "openai":
        selectedAdapter = openaiAdapter;
        modelName = "openai";
        break;
      case "auto":
      default:
        // Auto: prefer XAI for web search, OpenAI otherwise
        selectedAdapter = finalEnableWebSearch ? xaiAdapter : openaiAdapter;
        modelName = finalEnableWebSearch ? "xai" : "openai";
        break;
    }

    // ========================================================================
    // Process through Middleware Layer
    // ========================================================================
    const enhancedResponse = await processQueryWithMiddleware(
      query,
      (enrichedQuery, context) =>
        selectedAdapter(enrichedQuery, context, {
          narrationTime: resolvedNarrationTime,
          narrationType,
          language,
          interactionMode,
        }),
      {
        narrationTime: resolvedNarrationTime,
        narrationType,
        language,
        interactionMode,
        enableWebSearch: finalEnableWebSearch,
        userContext: userMindContext,
        chatHistory,
      }
    );

    // ========================================================================
    // Record User Interaction & Update Interests
    // ========================================================================
    try {
      const session = await getServerSession(authOptions);
      if (session?.user?.email) {
        const user = await prisma.user.findUnique({
          where: { email: session.user.email },
          select: { id: true },
        });
        
        if (user) {
          // Record this query in interaction history
          const responseLength = enhancedResponse.narration.split(/\s+/).length;
          await recordUserInteraction(user.id, query, responseLength);
          
          // Analyze and update interests every 5th query
          const interactionCount = await prisma.userInteractionHistory.count({
            where: {
              profile: {
                userId: user.id,
              },
            },
          });
          
          if (interactionCount % 5 === 0) {
            // Run interest analysis in background (don't await)
            analyzeAndUpdateInterests(user.id).catch(err => 
              console.error('Background interest analysis failed:', err)
            );
          }
        }
      }
    } catch (trackingError) {
      // Don't fail the request if tracking fails
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
      metadata: enhancedResponse.metadata,
    });
  } catch (err) {
    console.error("❌ AI API error:", err);
    return NextResponse.json(
      { error: "AI generation failed" },
      { status: 500 }
    );
  }
}
