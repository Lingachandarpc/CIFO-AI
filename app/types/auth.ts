import NextAuth, { type DefaultSession } from 'next-auth'

declare module 'next-auth' {
  interface User {
    id: string | number
    email: string
    name?: string | null
  }

  interface Session {
    user: {
      id: string | number
      email: string
      name?: string | null
    } & DefaultSession['user']
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    id: string | number
    email: string
    name?: string | null
  }
}
