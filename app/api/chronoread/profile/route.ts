import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '../../../services/authOptions'
import { getUserProfile, updateUserProfile } from '../../../services/userService'

export const runtime = 'nodejs'

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

    const profile = await getUserProfile(user.id)

    return NextResponse.json(
      {
        success: true,
        profile: {
          name: user.name || '',
          age: profile?.age ?? null,
          location: profile?.location || '',
          interests: profile?.interests || '',
          pulse: profile?.pulse || '',
          bio: profile?.bio || '',
        },
      },
      { headers: { 'Cache-Control': 'no-store' } }
    )
  } catch (error) {
    console.error('Error fetching profile:', error)
    return NextResponse.json(
      { error: 'Failed to fetch profile' },
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

    const parsedAge =
      typeof body.age === 'number'
        ? body.age
        : typeof body.age === 'string' && body.age.trim()
        ? parseInt(body.age, 10)
        : undefined

    if (typeof body.name === 'string') {
      await prisma.user.update({
        where: { id: user.id },
        data: { name: body.name },
      })
    }

    await updateUserProfile(user.id, {
      location: body.location,
      interests: body.interests,
      pulse: body.pulse,
      bio: body.bio,
      age: Number.isNaN(parsedAge) ? undefined : parsedAge,
    })

    return NextResponse.json({
      success: true,
      message: 'Profile updated',
    })
  } catch (error) {
    console.error('Error updating profile:', error)
    return NextResponse.json(
      { error: 'Failed to update profile' },
      { status: 500 }
    )
  }
}
