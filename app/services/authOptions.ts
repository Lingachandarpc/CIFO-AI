import { NextAuthOptions } from 'next-auth'
import type { Adapter } from 'next-auth/adapters'
import CredentialsProvider from 'next-auth/providers/credentials'
import GoogleProvider from 'next-auth/providers/google'
import { PrismaAdapter } from '@next-auth/prisma-adapter'
import prisma from '../../lib/prisma'
import bcrypt from 'bcryptjs'

const isGoogleEnabled =
  !!process.env.GOOGLE_CLIENT_ID &&
  !!process.env.GOOGLE_CLIENT_SECRET

// Build providers array based on available configuration
const providers: NextAuthOptions['providers'] = [
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
]

if (isGoogleEnabled) {
  // Google OAuth (enabled when credentials are configured)
  providers.push(
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID || '',
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
      allowDangerousEmailAccountLinking: true,
    })
  )
}

const adapter = PrismaAdapter(prisma) as Adapter

export const authOptions: NextAuthOptions = {
  adapter,
  providers,
  useSecureCookies: process.env.NODE_ENV === 'production',
  session: {
    strategy: 'jwt',
  },
  pages: {
    signIn: '/auth/signin',
    error: '/auth/signin?error=AuthError',
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id
        token.email = user.email
        token.name = user.name
      }
      return token
    },
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
    async session({ session, user, token }) {
      if (session.user) {
        const fallbackId = token?.id ?? user?.id
        if (fallbackId) session.user.id = fallbackId
        if (token?.email) session.user.email = token.email as string
        if (token?.name) session.user.name = token.name as string | null
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
