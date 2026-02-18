import prisma from '../../lib/prisma'
import { Settings, SearchMode, Language, VoiceGender, TextToSpeechProvider, AIModel, DEFAULT_GOOGLE_VOICE } from '../types'

/**
 * UserService: Manages user profiles, settings, and chat history.
 * Used for personalization - understanding user likes/dislikes and tailoring narrations.
 */

export async function getUserSettings(userId: number): Promise<Settings | null> {
  try {
    const settings = await prisma.userSettings.findUnique({
      where: { userId },
    })

    if (!settings) return null

    return {
      narrationType: settings.narrationType as Settings['narrationType'],
      voiceType: settings.voiceType,
      voiceGender: (settings.voiceGender as VoiceGender) || VoiceGender.AUTO,
      language: settings.language as Language,
      ttsProvider: (settings.ttsProvider as TextToSpeechProvider) || TextToSpeechProvider.GOOGLE,
      aiModel: (settings.aiModel as AIModel) || AIModel.AUTO,
      enableBackgroundMusic: settings.enableBackgroundMusic ?? true,
      backgroundMusicVolume: settings.backgroundMusicVolume ?? 0.15,
      enableWebSearch: true, // Always enabled for real-time data
    }
  } catch (error) {
    console.error('Error fetching user settings:', error)
    return null
  }
}

export async function updateUserSettings(
  userId: number,
  settings: Partial<Settings>
): Promise<void> {
  try {
    const createData = {
      userId,
      narrationType: settings.narrationType ?? 'Realistic',
      voiceType: settings.voiceType ?? DEFAULT_GOOGLE_VOICE,
      voiceGender: settings.voiceGender ?? 'auto',
      language: settings.language ?? 'English',
      ttsProvider: settings.ttsProvider ?? TextToSpeechProvider.GOOGLE,
      aiModel: settings.aiModel ?? 'auto',
      enableBackgroundMusic: settings.enableBackgroundMusic ?? true,
      backgroundMusicVolume: settings.backgroundMusicVolume ?? 0.15,
    };

    const updateData = {
      ...(settings.narrationType && { narrationType: settings.narrationType }),
      ...(settings.voiceType && { voiceType: settings.voiceType }),
      ...(settings.voiceGender && { voiceGender: settings.voiceGender }),
      ...(settings.language && { language: settings.language }),
      ...(settings.ttsProvider && { ttsProvider: settings.ttsProvider }),
      ...(settings.aiModel && { aiModel: settings.aiModel }),
      ...(settings.enableBackgroundMusic !== undefined && {
        enableBackgroundMusic: settings.enableBackgroundMusic,
      }),
      ...(settings.backgroundMusicVolume !== undefined && {
        backgroundMusicVolume: settings.backgroundMusicVolume,
      }),
    };

    await prisma.userSettings.upsert({
      where: { userId },
      create: createData,
      update: updateData,
    })
  } catch (error) {
    const message = String((error as { message?: string })?.message || error);
    const isVoiceGenderMismatch = message.toLowerCase().includes('voicegender');
    if (isVoiceGenderMismatch) {
      try {
        const fallbackCreate = { ...settings } as Record<string, unknown>;
        delete fallbackCreate.voiceGender;

        const fallbackUpdate = { ...settings } as Record<string, unknown>;
        delete fallbackUpdate.voiceGender;

        await prisma.userSettings.upsert({
          where: { userId },
          create: {
            userId,
            narrationType: settings.narrationType ?? 'Realistic',
            voiceType: settings.voiceType ?? DEFAULT_GOOGLE_VOICE,
            language: settings.language ?? 'English',
            ttsProvider: settings.ttsProvider ?? TextToSpeechProvider.GOOGLE,
            aiModel: settings.aiModel ?? 'auto',
            enableBackgroundMusic: settings.enableBackgroundMusic ?? true,
            backgroundMusicVolume: settings.backgroundMusicVolume ?? 0.15,
          },
          update: {
            ...(settings.narrationType && { narrationType: settings.narrationType }),
            ...(settings.voiceType && { voiceType: settings.voiceType }),
            ...(settings.language && { language: settings.language }),
            ...(settings.ttsProvider && { ttsProvider: settings.ttsProvider }),
            ...(settings.aiModel && { aiModel: settings.aiModel }),
            ...(settings.enableBackgroundMusic !== undefined && {
              enableBackgroundMusic: settings.enableBackgroundMusic,
            }),
            ...(settings.backgroundMusicVolume !== undefined && {
              backgroundMusicVolume: settings.backgroundMusicVolume,
            }),
          },
        })
        return;
      } catch (fallbackError) {
        console.error('Fallback settings update failed:', fallbackError)
      }
    }
    console.error('Error updating user settings:', error)
  }
}

export async function saveChatMessage(
  userId: number,
  role: 'user' | 'assistant',
  content: string,
  mode: SearchMode,
  audioBlob?: string
): Promise<void> {
  try {
    await prisma.chatHistory.create({
      data: {
        userId,
        role,
        content,
        mode: mode === SearchMode.BOOK ? 'BOOK' : mode === SearchMode.CASE_STUDY ? 'CASE_STUDY' : 'ASK',
        audioBlob: audioBlob || null,
      },
    })

    // Update user insights (last active, top topics)
    await updateUserInsight(userId, content, mode)
  } catch (error) {
    console.error('Error saving chat message:', error)
  }
}

export async function getChatHistory(
  userId: number,
  limit: number = 50
): Promise<Array<{ role: string; content: string }>> {
  try {
    const history = await prisma.chatHistory.findMany({
      where: { userId },
      orderBy: { timestamp: 'desc' },
      take: limit,
    })

    return history.reverse().map((msg: typeof history[number]) => ({
      role: msg.role,
      content: msg.content,
    }))
  } catch (error) {
    console.error('Error fetching chat history:', error)
    return []
  }
}

async function updateUserInsight(
  userId: number,
  query: string,
  mode: SearchMode
): Promise<void> {
  try {
    const insight = await prisma.userInsight.findUnique({
      where: { userId },
    })

    const topTopics =
      insight && insight.topTopics ? JSON.parse(insight.topTopics) : {}
    topTopics[query] = (topTopics[query] || 0) + 1

    await prisma.userInsight.upsert({
      where: { userId },
      create: {
        userId,
        topTopics: JSON.stringify(topTopics),
        preferredMode: mode === SearchMode.BOOK ? 'BOOK' : mode === SearchMode.CASE_STUDY ? 'CASE_STUDY' : 'ASK',
        lastActiveAt: new Date(),
      },
      update: {
        topTopics: JSON.stringify(topTopics),
        preferredMode: mode === SearchMode.BOOK ? 'BOOK' : mode === SearchMode.CASE_STUDY ? 'CASE_STUDY' : 'ASK',
        lastActiveAt: new Date(),
      },
    })
  } catch (error) {
    console.error('Error updating user insight:', error)
  }
}

export async function recordLike(userId: number): Promise<void> {
  try {
    await prisma.userInsight.upsert({
      where: { userId },
      create: {
        userId,
        likeCount: 1,
      },
      update: {
        likeCount: { increment: 1 },
      },
    })
  } catch (error) {
    console.error('Error recording like:', error)
  }
}

export async function recordDislike(userId: number): Promise<void> {
  try {
    await prisma.userInsight.upsert({
      where: { userId },
      create: {
        userId,
        dislikeCount: 1,
      },
      update: {
        dislikeCount: { increment: 1 },
      },
    })
  } catch (error) {
    console.error('Error recording dislike:', error)
  }
}

export async function getUserProfile(userId: number) {
  try {
    const profile = await prisma.userProfile.findUnique({
      where: { userId },
    })
    return profile
  } catch (error) {
    console.error('Error fetching user profile:', error)
    return null
  }
}

export async function updateUserProfile(
  userId: number,
  data: {
    location?: string
    interests?: string
    pulse?: string
    bio?: string
    age?: number
  }
): Promise<void> {
  try {
    await prisma.userProfile.upsert({
      where: { userId },
      create: {
        userId,
        ...data,
      },
      update: data,
    })
  } catch (error) {
    console.error('Error updating user profile:', error)
  }
}

/**
 * Categorize a query based on keywords
 */
export function categorizeQuery(query: string): string {
  const lowerQuery = query.toLowerCase();
  
  // Technology & AI
  if (/(artificial intelligence|machine learning|deep learning|neural network|ai|ml|llm|gpt|chatbot|automation|algorithm|data science|python|javascript|coding|programming|software|tech|computer)/i.test(lowerQuery)) {
    return 'Technology & AI';
  }
  
  // Science & Research
  if (/(physics|chemistry|biology|quantum|science|research|experiment|theory|molecule|atom|gene|evolution|astronomy|space|universe|planet)/i.test(lowerQuery)) {
    return 'Science';
  }
  
  // History & Culture
  if (/(history|ancient|civilization|war|empire|dynasty|historical|culture|tradition|heritage|museum|archaeological)/i.test(lowerQuery)) {
    return 'History & Culture';
  }
  
  // Health & Wellness
  if (/(health|fitness|exercise|nutrition|diet|wellness|medical|medicine|disease|therapy|mental health|yoga|meditation)/i.test(lowerQuery)) {
    return 'Health & Wellness';
  }
  
  // Business & Finance
  if (/(business|finance|stock|market|investment|economy|entrepreneur|startup|company|revenue|profit|bitcoin|crypto|trading)/i.test(lowerQuery)) {
    return 'Business & Finance';
  }
  
  // Travel & Geography
  if (/(travel|tourism|destination|country|city|vacation|trip|hotel|flight|geography|continent|ocean|mountain)/i.test(lowerQuery)) {
    return 'Travel & Geography';
  }
  
  // Food & Cooking
  if (/(cooking|recipe|food|cuisine|restaurant|chef|baking|ingredients|meal|dish|taste|flavor)/i.test(lowerQuery)) {
    return 'Food & Cooking';
  }
  
  // Entertainment & Media
  if (/(movie|film|music|song|artist|album|concert|tv show|series|netflix|game|gaming|entertainment|celebrity)/i.test(lowerQuery)) {
    return 'Entertainment';
  }
  
  // Sports & Recreation
  if (/(sport|football|basketball|cricket|tennis|soccer|athlete|team|championship|olympics|fitness|workout)/i.test(lowerQuery)) {
    return 'Sports';
  }
  
  // Education & Learning
  if (/(learn|study|education|school|university|course|tutorial|lesson|teaching|knowledge|skill)/i.test(lowerQuery)) {
    return 'Education';
  }
  
  // Utility queries (time, weather, etc.)
  if (/(time|date|weather|temperature|forecast|clock|calendar)/i.test(lowerQuery)) {
    return 'Utility';
  }
  
  return 'General';
}

/**
 * Record user interaction in history
 */
export async function recordUserInteraction(
  userId: number,
  query: string,
  responseLength?: number
): Promise<void> {
  try {
    // Get or create user profile
    let profile = await prisma.userProfile.findUnique({
      where: { userId },
    });
    
    if (!profile) {
      profile = await prisma.userProfile.create({
        data: { userId },
      });
    }
    
    const category = categorizeQuery(query);
    
    await prisma.userInteractionHistory.create({
      data: {
        profileId: profile.id,
        query,
        category,
        responseLength,
      },
    });
  } catch (error) {
    console.error('Error recording user interaction:', error);
  }
}

/**
 * Analyze user query patterns and update interests automatically
 */
export async function analyzeAndUpdateInterests(userId: number): Promise<void> {
  try {
    const profile = await prisma.userProfile.findUnique({
      where: { userId },
      include: {
        interactions: {
          orderBy: { timestamp: 'desc' },
          take: 50, // Analyze last 50 queries
        },
      },
    });
    
    if (!profile || profile.interactions.length < 5) {
      return; // Need at least 5 queries to analyze
    }
    
    // Count category frequencies
    const categoryCounts = new Map<string, number>();
    profile.interactions.forEach((interaction) => {
      if (interaction.category && interaction.category !== 'Utility' && interaction.category !== 'General') {
        categoryCounts.set(
          interaction.category,
          (categoryCounts.get(interaction.category) || 0) + 1
        );
      }
    });
    
    // Extract top interests (categories with 3+ occurrences)
    const interests: string[] = [];
    categoryCounts.forEach((count, category) => {
      if (count >= 3) {
        interests.push(category);
      }
    });
    
    // Sort by frequency and take top 8
    const sortedInterests = Array.from(categoryCounts.entries())
      .filter(([_, count]) => count >= 3)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([category]) => category);
    
    if (sortedInterests.length > 0) {
      const interestsString = sortedInterests.join(', ');
      
      // Update profile with new interests
      await prisma.userProfile.update({
        where: { userId },
        data: { interests: interestsString },
      });
    }
  } catch (error) {
    console.error('Error analyzing user interests:', error);
  }
}
