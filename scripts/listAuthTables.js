#!/usr/bin/env node
const { PrismaClient } = require('@prisma/client')

async function main(){
  const prisma = new PrismaClient()
  try{
    const users = await prisma.user.findMany({ select: { id: true, email: true, name: true, createdAt: true } })
    const accounts = await prisma.account.findMany({ select: { id: true, provider: true, providerAccountId: true, userId: true } })
    const sessions = await prisma.session.findMany({ select: { id: true, sessionToken: true, userId: true, expires: true } })

    console.log('\nUsers:\n', users)
    console.log('\nAccounts:\n', accounts)
    console.log('\nSessions:\n', sessions)
  }catch(e){
    console.error('Error querying DB:', e)
    process.exit(1)
  }finally{
    await prisma.$disconnect()
  }
}

main()
