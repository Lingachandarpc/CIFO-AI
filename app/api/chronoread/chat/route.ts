import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '../../../services/authOptions'
import {
  saveChatMessage,
} from '../../../services/userService'
import { SearchMode } from '../../../types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)

    if (!session || !session.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await req.json()
    const { role, content, mode, audioBlob } = body

    // Get user ID from email (Prisma stores Int IDs)
    const prisma = (await import('../../../../lib/prisma')).default
    const user = await prisma.user.findUnique({
      where: { email: session.user.email! },
    })

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    await saveChatMessage(
      user.id,
      role,
      content,
      mode === 'BOOK' ? SearchMode.BOOK : SearchMode.CASE_STUDY,
      audioBlob
    )

    return NextResponse.json({
      success: true,
      message: 'Chat saved',
    })
  } catch (error) {
    console.error('Error saving chat:', error)
    return NextResponse.json(
      { error: 'Failed to save chat' },
      { status: 500 }
    )
  }
}

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

    const { getChatHistory } = await import('../../../services/userService')
    const history = await getChatHistory(user.id, 50)

    return NextResponse.json(
      {
        success: true,
        history,
      },
      { headers: { 'Cache-Control': 'no-store' } }
    )
  } catch (error) {
    console.error('Error fetching chat history:', error)
    return NextResponse.json(
      { error: 'Failed to fetch chat history' },
      { status: 500 }
    )
  }
}
