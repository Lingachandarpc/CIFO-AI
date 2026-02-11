import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '../../../services/authOptions'

export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)

    if (!session || !session.user) {
      return NextResponse.json({
        authenticated: false,
      })
    }

    const prisma = (await import('../../../../lib/prisma')).default
    const user = await prisma.user.findUnique({
      where: { email: session.user.email! },
    })

    return NextResponse.json({
      authenticated: true,
      user: {
        id: user?.id,
        email: session.user.email,
        name: session.user.name,
      },
    })
  } catch (error) {
    console.error('Error checking auth:', error)
    return NextResponse.json({
      authenticated: false,
      error: 'Failed to check authentication',
    })
  }
}
