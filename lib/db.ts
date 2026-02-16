/**
 * DEPRECATED: This file uses better-sqlite3 for local SQLite access.
 * 
 * The project now uses Prisma as the primary ORM for all data:
 * - User authentication: Prisma User, Account, Session models
 * - User preferences: UserSettings, UserProfile models
 * - Chat history: ChatHistory model (for personalization)
 * - User insights: UserInsight model (for analytics)
 * 
 * See app/services/userService.ts for the new service layer.
 * Use API routes in app/api/chronoread/{chat,settings}/ to interact with the database.
 * 
 * This file is kept for backward compatibility only. New code should use Prisma via
 * app/lib/prisma.ts or API endpoints.
 */

import Database from 'better-sqlite3'
import path from 'path'

const dbPath = path.join(process.cwd(), 'data', 'chronoread.db')

// Create database connection
let db: Database.Database

export function getDB(): Database.Database {
  if (!db) {
    db = new Database(dbPath)
    db.pragma('journal_mode = WAL')
    initializeSchema()
  }
  return db
}

function initializeSchema() {
  const database = db

  // Users table
  database.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE,
      name TEXT,
      createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
      updatedAt TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `)

  // User profiles table
  database.exec(`
    CREATE TABLE IF NOT EXISTS user_profiles (
      id TEXT PRIMARY KEY,
      userId TEXT UNIQUE NOT NULL,
      location TEXT,
      interests TEXT,
      preferences TEXT,
      pulse TEXT,
      bio TEXT,
      age INTEGER,
      createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
      updatedAt TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
    )
  `)

  // User settings table
  database.exec(`
    CREATE TABLE IF NOT EXISTS user_settings (
      id TEXT PRIMARY KEY,
      userId TEXT UNIQUE NOT NULL,
      narrationType TEXT DEFAULT 'Realistic',
      voiceType TEXT DEFAULT 'en-US-Standard-C',
      language TEXT DEFAULT 'English',
      createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
      updatedAt TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
    )
  `)

  // Chat history table
  database.exec(`
    CREATE TABLE IF NOT EXISTS chat_history (
      id TEXT PRIMARY KEY,
      userId TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      timestamp TEXT DEFAULT CURRENT_TIMESTAMP,
      mode TEXT,
      audioBlob TEXT,
      FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
    )
  `)

  // Create indexes for faster queries
  database.exec(`
    CREATE INDEX IF NOT EXISTS idx_user_profiles_userId ON user_profiles(userId);
    CREATE INDEX IF NOT EXISTS idx_user_settings_userId ON user_settings(userId);
    CREATE INDEX IF NOT EXISTS idx_chat_history_userId ON chat_history(userId);
  `)
}

export function closeDB() {
  if (db) {
    db.close()
  }
}
