import prisma from '../../lib/prisma'
import { Settings, SearchMode, VoiceName, Language, VoiceGender, TextToSpeechProvider } from '../types'

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
      narrationTime: settings.narrationTime,
      narrationType: settings.narrationType as Settings['narrationType'],
      voiceType: settings.voiceType as VoiceName,
      voiceGender: (settings.voiceGender as VoiceGender) || VoiceGender.AUTO,
      language: settings.language as Language,
      ttsProvider: (settings.ttsProvider as TextToSpeechProvider) || TextToSpeechProvider.ELEVENLABS,
      enableBackgroundMusic: settings.enableBackgroundMusic ?? true,
      backgroundMusicVolume: settings.backgroundMusicVolume ?? 0.15,
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
      narrationTime: settings.narrationTime ?? 5,
      narrationType: settings.narrationType ?? 'Realistic',
      voiceType: settings.voiceType ?? 'zephyr',
      voiceGender: settings.voiceGender ?? 'auto',
      language: settings.language ?? 'English',
      ttsProvider: settings.ttsProvider ?? 'elevenlabs',
      enableBackgroundMusic: settings.enableBackgroundMusic ?? true,
      backgroundMusicVolume: settings.backgroundMusicVolume ?? 0.15,
    };

    const updateData = {
      ...(settings.narrationTime !== undefined && {
        narrationTime: settings.narrationTime,
      }),
      ...(settings.narrationType && { narrationType: settings.narrationType }),
      ...(settings.voiceType && { voiceType: settings.voiceType }),
      ...(settings.voiceGender && { voiceGender: settings.voiceGender }),
      ...(settings.language && { language: settings.language }),
      ...(settings.ttsProvider && { ttsProvider: settings.ttsProvider }),
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
            narrationTime: settings.narrationTime ?? 5,
            narrationType: settings.narrationType ?? 'Realistic',
            voiceType: settings.voiceType ?? 'zephyr',
            language: settings.language ?? 'English',
            ttsProvider: settings.ttsProvider ?? 'elevenlabs',
            enableBackgroundMusic: settings.enableBackgroundMusic ?? true,
            backgroundMusicVolume: settings.backgroundMusicVolume ?? 0.15,
          },
          update: {
            ...(settings.narrationTime !== undefined && {
              narrationTime: settings.narrationTime,
            }),
            ...(settings.narrationType && { narrationType: settings.narrationType }),
            ...(settings.voiceType && { voiceType: settings.voiceType }),
            ...(settings.language && { language: settings.language }),
            ...(settings.ttsProvider && { ttsProvider: settings.ttsProvider }),
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
