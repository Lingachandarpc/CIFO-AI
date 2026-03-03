import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '../../../services/authOptions'
import { getEffectiveUsagePolicyForUserEmail } from '../../../../lib/usagePolicy'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)

    if (!session || !session.user) {
      return NextResponse.json(
        {
        authenticated: false,
        },
        { headers: { 'Cache-Control': 'no-store' } }
      )
    }

    const prisma = (await import('../../../../lib/prisma')).default
    const user = await prisma.user.findUnique({
      where: { email: session.user.email! },
    })
    const policy = await getEffectiveUsagePolicyForUserEmail(req, session.user.email!)

    return NextResponse.json(
      {
        authenticated: true,
        user: {
          id: user?.id,
          email: session.user.email,
          name: session.user.name,
        },
        policy: policy
          ? {
              locked: policy.locked,
              sessionResponseLimit: policy.sessionResponseLimit,
              sessionResponseLimitsByTool: policy.sessionResponseLimitsByTool,
              sessionResponsesUsed: policy.sessionResponsesUsed,
              sessionResponsesRemaining: policy.sessionResponsesRemaining,
              disabledTools: policy.disabledTools,
              disabledModels: policy.disabledModels,
              enabledModelsByTool: policy.enabledModelsByTool,
            }
          : null,
      },
      { headers: { 'Cache-Control': 'no-store' } }
    )
  } catch (error) {
    console.error('Error checking auth:', error)
    return NextResponse.json(
      {
        authenticated: false,
        error: 'Failed to check authentication',
      },
      { headers: { 'Cache-Control': 'no-store' } }
    )
  }
}
