/**
 * Middleware Service Layer
 * Orchestrates AI models, web search, user context, and response combination
 * 
 * Architecture:
 * User Query → Middleware (context + Tavily) → AI Model → Middleware (combine) → Enhanced Response
 */

const TAVILY_API_URL = 'https://api.tavily.com/search';

// ============================================================================
// Types & Interfaces
// ============================================================================

export interface UserMindContext {
  profile?: {
    name?: string;
    age?: number | null;
    location?: string;
    interests?: string;
    pulse?: string;
    bio?: string;
  };
  mood?: {
    current: 'curious' | 'focused' | 'creative' | 'analytical' | 'casual';
    energy: 'low' | 'medium' | 'high';
    preferences: string[];
  };
  recentQueries?: string[];
  learningHistory?: Array<{
    topic: string;
    timestamp: Date;
    engagement: number;
  }>;
}

export interface SearchResult {
  title: string;
  url: string;
  content: string;
  score?: number;
  image?: string; // Optional image from search results
}

export interface MiddlewareContext {
  query: string;
  userContext: UserMindContext;
  webResults: SearchResult[];
  timestamp: Date;
  sessionId?: string;
  chatHistory?: Array<{ role: string; content: string }>;
}

export interface EnhancedResponse {
  narration: string;
  modelUsed: string;
  referencesHtml?: string; // Favicon-based references HTML (separate from narration)
  webSources?: Array<{ title: string; url: string; snippet: string }>;
  contextApplied: {
    userProfile: boolean;
    mood: boolean;
    webSearch: boolean;
  };
  metadata: {
    processingTime: number;
    searchResultsCount: number;
    aiTokensUsed?: number;
  };
}

// ============================================================================
// Time API for Real-Time Current Time
// ============================================================================

async function fetchCurrentTime(location?: string): Promise<string | null> {
  try {
    console.log('⏰ Fetching current time for location:', location);
    
    let apiUrl = 'https://worldtimeapi.org/api/timezone/';
    
    // Map location to timezone if provided
    if (location) {
      const timezoneMap: Record<string, string> = {
        'chennai': 'Asia/Kolkata',
        'mumbai': 'Asia/Kolkata',
        'delhi': 'Asia/Kolkata',
        'bangalore': 'Asia/Kolkata',
        'kolkata': 'Asia/Kolkata',
        'hyderabad': 'Asia/Kolkata',
        'pune': 'Asia/Kolkata',
        'india': 'Asia/Kolkata',
        'new york': 'America/New_York',
        'los angeles': 'America/Los_Angeles',
        'chicago': 'America/Chicago',
        'london': 'Europe/London',
        'paris': 'Europe/Paris',
        'tokyo': 'Asia/Tokyo',
        'singapore': 'Asia/Singapore',
        'dubai': 'Asia/Dubai',
        'sydney': 'Australia/Sydney',
      };
      
      const timezone = timezoneMap[location.toLowerCase()] || 'Asia/Kolkata';
      apiUrl += timezone;
      console.log('🌍 Using timezone:', timezone);
    } else {
      // Default to IP-based timezone detection
      apiUrl = 'https://worldtimeapi.org/api/ip';
      console.log('📍 Using IP-based timezone detection');
    }
    
    const response = await fetch(apiUrl, {
      headers: { 'Accept': 'application/json' },
      signal: AbortSignal.timeout(5000), // 5 second timeout
    });
    
    if (!response.ok) {
      console.warn('⚠️ WorldTimeAPI request failed:', response.status);
      // Fallback to device time
      return getDeviceTime(location);
    }
    
    interface WorldTimeResponse {
      datetime: string;
      timezone: string;
      utc_offset: string;
      day_of_week: number;
      day_of_year: number;
      week_number: number;
    }
    
    const data = (await response.json()) as WorldTimeResponse;
    
    console.log('📡 Raw API response:', {
      datetime: data.datetime,
      timezone: data.timezone,
      utc_offset: data.utc_offset
    });
    
    // Extract time components directly from the datetime string to avoid timezone conversion
    // Format: "2026-02-18T21:57:30.123456+05:30"
    const dateMatch = data.datetime.match(/(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})/);
    
    let timeStr: string;
    let dateStr: string;
    
    if (dateMatch) {
      // Parse components directly without timezone conversion
      const [, year, month, day, hour24, minute] = dateMatch;
      const hour = parseInt(hour24, 10);
      const isPM = hour >= 12;
      const hour12 = hour === 0 ? 12 : (hour > 12 ? hour - 12 : hour);
      
      timeStr = `${hour12}:${minute} ${isPM ? 'PM' : 'AM'}`;
      
      // Format date
      const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
                          'July', 'August', 'September', 'October', 'November', 'December'];
      const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      
      const dateObj = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
      const dayName = dayNames[dateObj.getDay()];
      const monthName = monthNames[parseInt(month) - 1];
      
      dateStr = `${dayName}, ${monthName} ${parseInt(day)}, ${year}`;
      
      console.log('✅ Parsed time directly from API string:', { timeStr, dateStr, hour: hour24, minute });
    } else {
      // Fallback: use Date parsing (less accurate but safer)
      console.warn('⚠️ Could not parse datetime string with regex, using Date constructor');
      const dt = new Date(data.datetime);
      timeStr = dt.toLocaleTimeString('en-US', { 
        hour: 'numeric', 
        minute: '2-digit',
        hour12: true,
        timeZone: data.timezone
      });
      dateStr = dt.toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        timeZone: data.timezone
      });
    }
    
    // Format time data in a VERY explicit way that AI cannot miss
    const timeData = `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🕐 REAL-TIME DATA FROM WORLDTIME API (USE THIS DIRECTLY)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

**Current Time**: ${timeStr}
**Date**: ${dateStr}
**Timezone**: ${data.timezone} (${data.utc_offset})

⚠️ INSTRUCTION: This is the ACTUAL current time. State it directly to the user.
Example response: "It's currently ${timeStr} in ${data.timezone.split('/')[1]?.replace('_', ' ') || 'your location'}."

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`;
    console.log('✅ Time data fetched successfully:', timeData);
    
    return timeData;
    
  } catch (error) {
    console.error('❌ Error fetching current time:', error);
    // Ultimate fallback to device time
    return getDeviceTime(location);
  }
}

/**
 * Fallback to device time if API fails
 */
function getDeviceTime(location?: string): string {
  try {
    const now = new Date();
    const timeStr = now.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
    const dateStr = now.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });

    const timeData = `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🕐 DEVICE TIME (CURRENT TIME)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

**Current Time**: ${timeStr}
**Date**: ${dateStr}

⚠️ INSTRUCTION: This is the CURRENT time from the device. State it directly to the user.
Example response: "It's currently ${timeStr}."

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`;
    console.log('✅ Device time used as fallback:', timeData);
    return timeData;
  } catch (error) {
    console.error('❌ Error getting device time:', error);
    // Ultimate fallback: return a generic current time message
    const now = new Date();
    return `CURRENT TIME: ${now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}`;
  }
}

// ============================================================================
// Tavily Web Search
// ============================================================================

/**
 * Determine optimal number of search results based on query complexity
 */
function determineSearchComplexity(query: string): {
  maxResults: number;
  searchDepth: 'basic' | 'advanced';
} {
  const lower = query.toLowerCase();
  
  // Simple utility queries - minimal results needed
  if (/(what time|current time|time now|weather|temperature|forecast)/i.test(lower)) {
    return { maxResults: 2, searchDepth: 'basic' };
  }
  
  // Simple factual questions - few results
  if (/(what is|who is|when did|where is|define|meaning)/i.test(lower) && query.split(' ').length <= 8) {
    return { maxResults: 3, searchDepth: 'basic' };
  }
  
  // Research/comparison queries - more results
  if (/(compare|difference|best|top|alternatives|pros and cons|vs|versus)/i.test(lower)) {
    return { maxResults: 7, searchDepth: 'advanced' };
  }
  
  // Complex analysis queries - maximum results
  if (/(explain|analyze|how does|why is|comprehensive|detailed|overview)/i.test(lower)) {
    return { maxResults: 5, searchDepth: 'advanced' };
  }
  
  // News/current events - moderate results
  if (/(latest|recent|news|breaking|today|current events)/i.test(lower)) {
    return { maxResults: 5, searchDepth: 'basic' };
  }
  
  // Default - balanced approach
  return { maxResults: 4, searchDepth: 'basic' };
}

/**
 * Detect if query needs current time context to answer properly
 */
/**
 * Determine if query genuinely needs time context (not just any mention of time-related keywords)
 * Filters out irrelevant topics like "China's hot news today" that shouldn't include time greetings
 */
function needsTimeContext(query: string): boolean {
  const lower = query.toLowerCase();
  
  // EXPLICIT: Direct time-asking questions only
  if (/(what time|current time|time now|what's the time|tell me the time|time is it|what hour)/i.test(lower)) {
    return true;
  }
  
  // NEWS/EVENTS queries should NOT trigger time context
  // "China's hot news today" shouldn't include "It's currently 7:37 PM IST"
  if (/(news|breaking|latest|update|event|incident|story|happening)/i.test(lower)) {
    return false; // DO NOT add time context to news queries
  }
  
  // Contextual queries that need time awareness
  // "Is it good time for coffee?" - needs to know if it's morning/afternoon
  if (/(good time|right time|best time|appropriate time|ideal time)\s+(for|to)/i.test(lower)) {
    return true;
  }
  
  // Time of day questions
  if (/(is it|it's|its)\s+(morning|afternoon|evening|night|late|early)/i.test(lower)) {
    return true;
  }
  
  // Activity timing questions (but filter out general discussion)
  if (/(should i|can i|is it okay to)\s+(sleep|nap|eat|drink|coffee|tea|exercise|workout|study|read)/i.test(lower)) {
    return true;
  }
  
  // "Now" context - only if genuinely asking about current moment
  if (/\b(now|right now|at the moment|currently)\b/i.test(lower) && 
      /(should|can|is it|do|go|eat|drink|sleep|work)/i.test(lower)) {
    return true;
  }
  
  // Time-based recommendations
  if (/(coffee|tea|breakfast|lunch|dinner|meal|snack|workout|exercise|run|walk|sleep)/i.test(lower) &&
      /(should|can|good|time|now|appropriate)/i.test(lower)) {
    return true;
  }
  
  return false;
}

/**
 * Location to country/region mapping for query refinement
 */
function getLocationContext(location?: string): {
  country: string;
  region: string;
  trustedSources: string[];
  newsKeywords: string[];
} {
  const locLower = location?.toLowerCase() || '';
  
  // India + Tamil Nadu
  if (locLower.includes('chennai') || locLower.includes('tamil')) {
    return {
      country: 'India',
      region: 'Tamil Nadu',
      trustedSources: ['thehindu.com', 'hindutamil.in', 'vikatan.com', 'dinamalar.com', 'indiatoday.in', 'bbc.com/tamil', 'firstpost.com'],
      newsKeywords: ['Tamil', 'Chennai', 'TN', 'Tamilnadu', 'India'],
    };
  }
  
  if (locLower.includes('bangalore') || locLower.includes('bengaluru')) {
    return {
      country: 'India',
      region: 'Karnataka',
      trustedSources: ['thehindu.com', 'deccanherald.com', 'deccanchronicle.com', 'indiatoday.in', 'indianexpress.com'],
      newsKeywords: ['Bangalore', 'Bengaluru', 'Karnataka', 'India'],
    };
  }
  
  if (locLower.includes('mumbai') || locLower.includes('maharashtra')) {
    return {
      country: 'India',
      region: 'Maharashtra',
      trustedSources: ['mid-day.com', 'hindustantimes.com', 'indianexpress.com', 'theprint.in', 'indiatoday.in'],
      newsKeywords: ['Mumbai', 'Maharashtra', 'Bombay', 'India'],
    };
  }
  
  if (locLower.includes('delhi') || locLower.includes('new delhi')) {
    return {
      country: 'India',
      region: 'Delhi',
      trustedSources: ['thehindu.com', 'hindustantimes.com', 'indianexpress.com', 'theprint.in', 'indiatoday.in', 'firstpost.com'],
      newsKeywords: ['Delhi', 'New Delhi', 'India'],
    };
  }
  
  // USA
  if (locLower.includes('new york') || locLower.includes('nyc')) {
    return {
      country: 'USA',
      region: 'New York',
      trustedSources: ['nytimes.com', 'newyorker.com', 'newsday.com', 'gothamist.com', 'ny1.com', 'cnn.com', 'bbc.com'],
      newsKeywords: ['New York', 'NYC', 'Manhattan', 'USA'],
    };
  }
  
  if (locLower.includes('los angeles') || locLower.includes('la')) {
    return {
      country: 'USA',
      region: 'California',
      trustedSources: ['latimes.com', 'scpr.org', 'thewrap.com', 'deadline.com', 'hollywoodreporter.com', 'cnn.com', 'bbc.com'],
      newsKeywords: ['Los Angeles', 'LA', 'California', 'Hollywood', 'USA'],
    };
  }
  
  if (locLower.includes('chicago')) {
    return {
      country: 'USA',
      region: 'Illinois',
      trustedSources: ['chicagotribune.com', 'suntimes.com', 'wbez.org', 'abc7chicago.com', 'cnn.com', 'bbc.com'],
      newsKeywords: ['Chicago', 'Illinois', 'USA'],
    };
  }
  
  // Default - Global
  return {
    country: 'Global',
    region: 'Worldwide',
    trustedSources: ['bbc.com', 'cnn.com', 'reuters.com', 'apnews.com', 'theguardian.com', 'aljazeera.com', 'npr.org'],
    newsKeywords: [],
  };
}

/**
 * Filter and prioritize search results by trusted sources and relevance
 */
function filterByTrustedSources(
  results: Array<{
    title: string;
    url: string;
    content: string;
    score?: number;
    image?: string;
  }>,
  trustedSources: string[],
  locationKeywords: string[]
): Array<{
  title: string;
  url: string;
  content: string;
  score?: number;
  image?: string;
}> {
  // Score each result: trusted source + location relevance
  const scoredResults = results.map(r => {
    let score = r.score || 0.5;
    
    // Boost for trusted sources
    const isTrusted = trustedSources.some(source => r.url.includes(source));
    if (isTrusted) {
      score += 0.3; // +0.3 for trusted sources
    }
    
    // Boost for location-specific keywords in title/content
    const hasLocationRelevance = locationKeywords.some(keyword => 
      r.title.toLowerCase().includes(keyword.toLowerCase()) ||
      r.content.toLowerCase().includes(keyword.toLowerCase())
    );
    if (hasLocationRelevance) {
      score += 0.2; // +0.2 for location relevance
    }
    
    // Penalize social media unless it's from verified news accounts
    if ((r.url.includes('twitter.com') || r.url.includes('instagram.com') || r.url.includes('facebook.com')) &&
        !r.url.includes('news') && !r.url.includes('official')) {
      score -= 0.1; // -0.1 for unverified social media
    }
    
    return { ...r, finalScore: score };
  });
  
  // Sort by final score (highest first) and return top results
  return scoredResults
    .sort((a, b) => (b.finalScore || 0) - (a.finalScore || 0))
    .map(({ finalScore, ...r }) => r);;
}

async function fetchTavilyResults(
  query: string,
  options: {
    maxResults?: number;
    topic?: 'news' | 'general';
    searchDepth?: 'basic' | 'advanced';
    location?: string; // NEW: user location for context-aware search
  } = {}
): Promise<SearchResult[]> {
  const tavilyKey = process.env.TAVILY_API_KEY;
  if (!tavilyKey) {
    console.warn('⚠️ Tavily API key not set - web search disabled');
    return [];
  }

  try {
    // Get location context for search refinement
    const locationContext = getLocationContext(options.location);
    
    // Enhance query with location-aware keywords
    let enhancedQuery = query;
    if (options.location && locationContext.newsKeywords.length > 0) {
      // Add location context to query for better results
      enhancedQuery = `${query} (${locationContext.newsKeywords.join(' OR ')})`;
      console.log('🌍 Location-aware search:', { 
        query, 
        location: options.location,
        context: locationContext.country,
        enhancedQuery 
      });
    }
    
    const response = await fetch(TAVILY_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: tavilyKey,
        query: enhancedQuery,
        include_answer: true,
        include_images: true,
        max_results: (options.maxResults || 5) + 3, // Fetch extra results for filtering
        topic: options.topic || 'general',
        search_depth: options.searchDepth || 'basic',
      }),
    });

    if (!response.ok) {
      console.warn('⚠️ Tavily search failed:', response.status);
      return [];
    }

    interface TavilyResponse {
      results: Array<{
        title: string;
        url: string;
        content: string;
        score?: number;
        image?: string;
      }>;
      answer?: string;
      images?: string[];
    }

    const data = (await response.json()) as TavilyResponse;
    
    // Map results and filter by trusted sources
    const mappedResults = (data.results || []).map((r, idx) => {
      const result: SearchResult = {
        ...r,
        image: data.images?.[idx] || r.image,
      };
      return result;
    });
    
    // Apply location-based filtering and prioritization
    const filteredResults = filterByTrustedSources(
      mappedResults,
      locationContext.trustedSources,
      locationContext.newsKeywords
    );
    
    // Return limited results after filtering
    return filteredResults.slice(0, options.maxResults || 5);
  } catch (error) {
    console.error('❌ Error fetching Tavily results:', error);
    return [];
  }
}

// ============================================================================
// Context Enrichment
// ============================================================================

function enrichQueryWithContext(
  query: string,
  userContext: UserMindContext
): string {
  const enrichments: string[] = [];

  // Add user profile context
  if (userContext.profile) {
    const p = userContext.profile;
    if (p.interests) enrichments.push(`User interests: ${p.interests}`);
    if (p.pulse) enrichments.push(`Current focus: ${p.pulse}`);
    if (p.location) enrichments.push(`Location: ${p.location}`);
  }

  // Add mood context
  if (userContext.mood) {
    const m = userContext.mood;
    enrichments.push(`User mood: ${m.current} (energy: ${m.energy})`);
    if (m.preferences.length > 0) {
      enrichments.push(`Preferences: ${m.preferences.join(', ')}`);
    }
  }

  // Add learning history
  if (userContext.learningHistory && userContext.learningHistory.length > 0) {
    const recentTopics = userContext.learningHistory
      .slice(-3)
      .map(h => h.topic)
      .join(', ');
    enrichments.push(`Recent learning: ${recentTopics}`);
  }

  if (enrichments.length === 0) return query;

  return `${query}\n\n[Context: ${enrichments.join(' | ')}]`;
}

// ============================================================================
// Response Combination
// ============================================================================

function combineAIandWebResults(
  aiResponse: string,
  webResults: SearchResult[]
): { narration: string; referencesHtml?: string } {
  if (webResults.length === 0) return { narration: aiResponse };

  const limitedResults = webResults.slice(0, 5);

  // Images removed from response per user request
  const imageSection = '';

  // Generate favicon stack showing all references
  const faviconStack = limitedResults
    .map((r, idx) => {
      const domain = new URL(r.url).hostname;
      const favicon = `https://www.google.com/s2/favicons?domain=${domain}&sz=20`;
      const offset = idx * 14; // 14px overlap
      return `<a href="${r.url}" target="_blank" rel="noopener noreferrer" title="${r.title}" style="position:absolute;left:${offset}px;top:0;z-index:${10 - idx};"><img src="${favicon}" alt="${r.title}" width="20" height="20" style="border:1.5px solid white;border-radius:50%;box-shadow:0 1px 3px rgba(0,0,0,0.2);background:white;"/></a>`;
    })
    .join('');

  const stackWidth = limitedResults.length * 14 + 20;

  const totalButtonWidth = stackWidth;

  // Return narration and references separately (do NOT append references to narration)
  const webContext = `<span data-web-refs style="display:inline-flex;align-items:center;margin-left:4px;"><span style="position:relative;height:20px;width:${totalButtonWidth}px;display:inline-block;">${faviconStack}</span></span>`;

  return {
    narration: aiResponse + imageSection,
    referencesHtml: limitedResults.length > 0 ? webContext : undefined,
  };
}

// ============================================================================
// Main Middleware Orchestrator
// ============================================================================

export async function processQueryWithMiddleware(
  query: string,
  aiModelFunction: (enrichedQuery: string, context: MiddlewareContext) => Promise<string>,
  options: {
    narrationTime: number;
    narrationType: string;
    language: string;
    interactionMode: 'read' | 'listen';
    enableWebSearch: boolean;
    userContext?: UserMindContext;
    chatHistory?: Array<{ role: string; content: string }>;
  }
): Promise<EnhancedResponse> {
  const startTime = Date.now();

  // 1. Prepare user context
  const userContext: UserMindContext = options.userContext || {
    mood: { current: 'curious', energy: 'medium', preferences: [] },
  };

  // 2. Detect query type and fetch appropriate data
  let webResults: SearchResult[] = [];
  let timeData: string | null = null;
  
  if (options.enableWebSearch) {
    const queryLower = query.toLowerCase();
    const needsTime = needsTimeContext(query);
    
    console.log('🔍 Web search check:', { 
      query, 
      needsTime, 
      enableWebSearch: options.enableWebSearch,
      location: userContext?.profile?.location 
    });
    
    if (needsTime) {
      // For time-contextual queries, fetch actual current time
      const location = userContext?.profile?.location;
      timeData = await fetchCurrentTime(location);
      
      // If time API succeeds, use it as primary data source
      if (timeData) {
        webResults = [{
          title: 'Current Time Information',
          url: 'https://worldtimeapi.org',
          content: timeData,
          score: 1.0,
        }];
      } else {
        // Fallback to Tavily with minimal results, include location for context
        const complexity = determineSearchComplexity(query);
        webResults = await fetchTavilyResults(query, {
          maxResults: 2,
          topic: 'general',
          searchDepth: 'basic',
          location: userContext?.profile?.location, // Pass location for trusted source filtering
        });
      }
    } else {
      // For other queries, use dynamic Tavily search with location awareness
      const complexity = determineSearchComplexity(query);
      webResults = await fetchTavilyResults(query, {
        maxResults: complexity.maxResults,
        topic: queryLower.includes('news') || queryLower.includes('latest') ? 'news' : 'general',
        searchDepth: complexity.searchDepth,
        location: userContext?.profile?.location, // Pass location for trusted source filtering
      });
    }
  }

  // 3. Enrich query with context
  const enrichedQuery = enrichQueryWithContext(query, userContext);

  // 4. Build middleware context
  const middlewareContext: MiddlewareContext = {
    query: enrichedQuery,
    userContext,
    webResults,
    timestamp: new Date(),
    chatHistory: options.chatHistory || [],
  };

  // 5. Call AI model with enriched context
  const aiResponse = await aiModelFunction(enrichedQuery, middlewareContext);

  // 6. Combine AI response with web results (separated)
  const combined = combineAIandWebResults(
    aiResponse,
    webResults
  );

  // 7. Build enhanced response
  const processingTime = Date.now() - startTime;

  const enhancedResponse: EnhancedResponse = {
    narration: combined.narration,
    referencesHtml: combined.referencesHtml,
    modelUsed: 'middleware-enhanced',
    webSources: webResults.slice(0, 3).map(r => ({
      title: r.title,
      url: r.url,
      snippet: r.content.substring(0, 150) + '...',
    })),
    contextApplied: {
      userProfile: !!userContext.profile,
      mood: !!userContext.mood,
      webSearch: webResults.length > 0,
    },
    metadata: {
      processingTime,
      searchResultsCount: webResults.length,
    },
  };

  return enhancedResponse;
}

// ============================================================================
// Mood & Mind State Management (Future Ready)
// ============================================================================

export class UserMindStorage {
  private static instance: UserMindStorage;
  private userStates: Map<string, UserMindContext> = new Map();

  private constructor() {}

  static getInstance(): UserMindStorage {
    if (!UserMindStorage.instance) {
      UserMindStorage.instance = new UserMindStorage();
    }
    return UserMindStorage.instance;
  }

  async getUserContext(userId: string): Promise<UserMindContext> {
    // TODO: Fetch from database
    return this.userStates.get(userId) || {
      mood: { current: 'curious', energy: 'medium', preferences: [] },
    };
  }

  async updateUserContext(
    userId: string,
    context: Partial<UserMindContext>
  ): Promise<void> {
    const existing = this.userStates.get(userId) || {
      mood: { current: 'curious', energy: 'medium', preferences: [] },
    };
    this.userStates.set(userId, { ...existing, ...context });
    // TODO: Persist to database
  }

  async trackLearning(
    userId: string,
    topic: string,
    engagement: number
  ): Promise<void> {
    const context = await this.getUserContext(userId);
    const learningHistory = context.learningHistory || [];
    learningHistory.push({ topic, timestamp: new Date(), engagement });
    
    // Keep only last 50 items
    if (learningHistory.length > 50) {
      learningHistory.shift();
    }
    
    await this.updateUserContext(userId, { learningHistory });
  }
}

// ============================================================================
// Exports
// ============================================================================

export const mindStorage = UserMindStorage.getInstance();
