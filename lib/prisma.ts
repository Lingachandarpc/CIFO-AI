import { PrismaClient } from '@prisma/client'

declare global {
  // allow global `var` in development to persist across module reloads
  // eslint-disable-next-line no-var
  var prisma: PrismaClient | undefined
}

const client = global.prisma || new PrismaClient()
if (process.env.NODE_ENV === 'development') global.prisma = client

export default client
