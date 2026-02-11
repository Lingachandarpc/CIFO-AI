import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '../../../services/authOptions'
import { getUserSettings, updateUserSettings } from '../../../services/userService'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const session = await getServerSession(authOptions)

    if (!session || !session.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const prisma = (await import('../../../../lib/prisma')).default
    const user = await prisma.user.findUnique({
      where: { email: session.user.email! },
    })

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const settings = await getUserSettings(user.id)

    return NextResponse.json(
      {
        success: true,
        settings: settings || {
          narrationTime: 5,
          narrationType: 'Realistic',
          voiceType: 'zephyr',
          voiceGender: 'auto',
          language: 'English',
          ttsProvider: 'elevenlabs',
          enableBackgroundMusic: true,
          backgroundMusicVolume: 0.15,
        },
      },
      { headers: { 'Cache-Control': 'no-store' } }
    )
  } catch (error) {
    console.error('Error fetching settings:', error)
    return NextResponse.json(
      { error: 'Failed to fetch settings' },
      { status: 500 }
    )
  }
}

export async function PUT(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)

    if (!session || !session.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await req.json()
    const prisma = (await import('../../../../lib/prisma')).default
    const user = await prisma.user.findUnique({
      where: { email: session.user.email! },
    })

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    await updateUserSettings(user.id, body)

    return NextResponse.json({
      success: true,
      message: 'Settings updated',
    })
  } catch (error) {
    console.error('Error updating settings:', error)
    return NextResponse.json(
      { error: 'Failed to update settings' },
      { status: 500 }
    )
  }
}
