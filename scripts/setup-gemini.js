#!/usr/bin/env node

/**
 * Gemini API Key Setup Helper
 * Run this to get instructions for setting up Gemini
 */

console.log('\n╔═══════════════════════════════════════════════════════════════╗');
console.log('║           🚀 GEMINI API KEY SETUP (FREE)                     ║');
console.log('╚═══════════════════════════════════════════════════════════════╝\n');

console.log('📋 STEP-BY-STEP INSTRUCTIONS:\n');

console.log('1️⃣  Open this link in your browser:');
console.log('   👉 https://aistudio.google.com/app/apikey\n');

console.log('2️⃣  Sign in with your Google account\n');

console.log('3️⃣  Click "Create API Key" button\n');

console.log('4️⃣  Copy the generated key (it starts with: AIzaSy...)\n');

console.log('5️⃣  Open your .env.local file and update line 9:');
console.log('   BEFORE: GEMINI_API_KEY=');
console.log('   AFTER:  GEMINI_API_KEY=AIzaSy_YOUR_ACTUAL_KEY_HERE\n');

console.log('6️⃣  Save the file and the dev server will auto-reload!\n');

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

console.log('⚠️  IMPORTANT NOTES:\n');
console.log('   • Gemini API key starts with: AIzaSy...');
console.log('   • It\'s different from Google Cloud/TTS keys (AQ....)');
console.log('   • It\'s FREE: 15 requests/min, 1500/day');
console.log('   • Get it from AI Studio, NOT Google Cloud Console\n');

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

console.log('✨ AFTER SETUP:\n');
console.log('   1. Go to Settings in the app (⚙️ icon)');
console.log('   2. Select "Gemini" from AI Model dropdown');
console.log('   3. Click Save');
console.log('   4. Start asking questions!\n');

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

console.log('❓ TROUBLESHOOTING:\n');
console.log('   • "Invalid API key" → Check the key starts with AIzaSy...');
console.log('   • Key not working → Make sure you copied the entire key');
console.log('   • No .env.local file → Copy from .env.example\n');

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

console.log('🎯 QUICK TEST:\n');
console.log('   Once setup, try asking:');
console.log('   "What is the financial position of Apollo Hospital in 2026?"\n');
console.log('   It will fetch real-time data using Tavily + Gemini!\n');

console.log('╔═══════════════════════════════════════════════════════════════╗');
console.log('║  Need more help? Check GEMINI_SETUP.md in the project root   ║');
console.log('╚═══════════════════════════════════════════════════════════════╝\n');
