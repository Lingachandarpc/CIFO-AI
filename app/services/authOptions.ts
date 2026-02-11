import { NextAuthOptions } from 'next-auth'
import CredentialsProvider from 'next-auth/providers/credentials'
import GoogleProvider from 'next-auth/providers/google'
import { PrismaAdapter } from '@next-auth/prisma-adapter'
import prisma from '../../lib/prisma'
import bcrypt from 'bcryptjs'

// Build providers array based on available configuration
const providers = [
  // Credentials provider for email + password
  CredentialsProvider({
    name: 'Credentials',
    credentials: {
      email: { label: 'Email', type: 'email' },
      password: { label: 'Password', type: 'password' },
    },
    async authorize(credentials) {
      if (!credentials?.email || !credentials?.password) {
        return null
      }

      try {
        const user = await prisma.user.findUnique({
          where: { email: credentials.email.toLowerCase() },
        })

        if (!user || !user.password) {
          return null
        }

        const passwordMatch = await bcrypt.compare(
          credentials.password,
          user.password
        )

        if (!passwordMatch) {
          return null
        }

        return {
          id: user.id,
          email: user.email,
          name: user.name,
        }
      } catch (error) {
        console.error('Auth error:', error)
        return null
      }
    },
  }),

  // Google OAuth
  GoogleProvider({
    clientId: process.env.GOOGLE_CLIENT_ID || '',
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
  }),
]

// Wrap Prisma adapter to add logging around session/account creation
const rawAdapter = PrismaAdapter(prisma as any) as any
const adapter = {
  ...rawAdapter,
  async createSession(data: any) {
    try {
      console.log('Adapter.createSession called with:', data?.sessionToken, data?.userId)
      const res = await rawAdapter.createSession(data)
      console.log('Adapter.createSession result id:', res?.id)
      return res
    } catch (err) {
      console.error('Adapter.createSession error:', err)
      throw err
    }
  },
}

export const authOptions: NextAuthOptions = {
  adapter,
  providers,
  session: {
    strategy: 'database',
  },
  pages: {
    signIn: '/auth/signin',
    error: '/auth/signin?error=AuthError',
  },
  callbacks: {
    async signIn({ user, account, profile }) {
      // Debug logging for sign-in attempts
      try {
        console.log('callbacks.signIn called:', { user, account: account?.provider, profile })
      } catch (e) {
        console.error('Error logging signIn callback:', e)
      }
      return true
    },
    async redirect({ url, baseUrl }) {
      try {
        // If the provider redirected to the root, send users to /app
        if (url && (url === '/' || url === `${baseUrl}/`)) {
          return `${baseUrl}/app`
        }

        // Preserve onboarding route if present
        if (url && url.includes('/auth/setup-profile')) {
          if (url.startsWith('/')) return `${baseUrl}${url}`
          return url
        }

        // Allow absolute or relative local URLs
        if (url && url.startsWith(baseUrl)) return url
        if (url && url.startsWith('/')) return `${baseUrl}${url}`

        // Default to /app
        return `${baseUrl}/app`
      } catch (e) {
        console.error('redirect callback error', e)
        return `${baseUrl}/app`
      }
    },
    async session({ session, user }) {
      // Add user ID to session for credentials provider
      if (session.user) {
        session.user.id = user.id
      }
      return session
    },
  },
  events: {
    async signIn({ user, isNewUser }) {
      console.log('events.signIn:', { email: user.email, isNewUser })
    },
  },
}

export default authOptions
