#!/usr/bin/env node
/* eslint-disable @typescript-eslint/no-require-imports */
const { PrismaClient } = require('@prisma/client')
const bcrypt = require('bcryptjs')

async function main() {
  const prisma = new PrismaClient()

  const argv = require('minimist')(process.argv.slice(2))
  const email = (argv.email || argv.e || process.env.EMAIL)
  const password = (argv.password || argv.p || process.env.PASSWORD)
  const name = argv.name || argv.n || process.env.NAME || null

  if (!email || !password) {
    console.error('Usage: node scripts/createUser.js --email user@example.com --password secret123 [--name "User Name"]')
    process.exit(1)
  }

  try {
    const existing = await prisma.user.findUnique({ where: { email: email.toLowerCase() } })
    if (existing) {
      console.error('User already exists with that email:', email)
      process.exit(1)
    }

    const hashed = await bcrypt.hash(password, 10)

    const user = await prisma.user.create({
      data: {
        email: email.toLowerCase(),
        name,
        password: hashed,
        settings: { create: {} },
      },
    })

    console.log('Created user:', { id: user.id, email: user.email, name: user.name })
    process.exit(0)
  } catch (err) {
    console.error('Error creating user:', err)
    process.exit(1)
  } finally {
    // eslint-disable-next-line no-unsafe-finally
    await prisma.$disconnect()
  }
}

main()
