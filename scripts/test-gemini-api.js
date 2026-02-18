/**
 * Test Gemini API connection
 */
const fs = require('fs');
const path = require('path');

// Load .env.local manually
const envPath = path.join(__dirname, '..', '.env.local');
console.log('📂 Reading from:', envPath);
console.log('📂 File exists:', fs.existsSync(envPath));

if (!fs.existsSync(envPath)) {
  console.error('❌ .env.local file not found!');
  process.exit(1);
}

const envContent = fs.readFileSync(envPath, 'utf8');
console.log('📄 File length:', envContent.length, 'bytes');
console.log('📄 Has \\r:', envContent.includes('\r'));
console.log('📄 Has \\n:', envContent.includes('\n'));
console.log('📄 First line:', JSON.stringify(envContent.split(/\r?\n/)[0]));
console.log('');

const envVars = {};
const lines = envContent.split(/\r?\n/);
console.log('📋 Total lines:', lines.length);

lines.forEach((line, index) => {
  // Skip comments and empty lines
  if (line.startsWith('#') || !line.trim()) return;
  
  const match = line.match(/^([^=]+)=(.*)$/);
  if (match) {
    const key = match[1].trim();
    let value = match[2].trim();
    
    // Remove quotes if present
    if ((value.startsWith('"') && value.endsWith('"')) || 
        (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    
    envVars[key] = value;
    
    if (index < 10) {  // Log first 10 parsed keys
      console.log(`  Line ${index + 1}: ${key} = ${value.substring(0, 20)}...`);
    }
  }
});

console.log('\n📋 Found environment variables:', Object.keys(envVars).length);
Object.keys(envVars).forEach(key => {
  if (key.includes('KEY') || key.includes('SECRET')) {
    console.log(`  ${key}: ${envVars[key].substring(0, 15)}...`);
  }
});
console.log('');

const GEMINI_API_KEY = envVars.GEMINI_API_KEY;
const GEMINI_MODEL = 'gemini-2.5-flash';
const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

async function testGeminiAPI() {
  console.log('🔍 Testing Gemini API...\n');
  
  if (!GEMINI_API_KEY) {
    console.error('❌ GEMINI_API_KEY not found in .env.local');
    return;
  }
  
  console.log(`✓ API Key found: ${GEMINI_API_KEY.substring(0, 15)}...`);
  console.log(`✓ Using model: ${GEMINI_MODEL}`);
  
  const apiUrl = `${GEMINI_API_BASE}/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;
  console.log(`✓ API URL: ${apiUrl.replace(GEMINI_API_KEY, 'API_KEY')}\n`);

  const requestBody = {
    contents: [
      {
        role: 'user',
        parts: [{ text: 'Say "Hello, Gemini is working!" in exactly 5 words.' }]
      }
    ],
    generationConfig: {
      temperature: 0.7,
      topK: 40,
      topP: 0.95,
      maxOutputTokens: 100,
    },
  };

  console.log('📤 Sending test request...');
  
  try {
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    console.log(`📥 Response status: ${response.status} ${response.statusText}\n`);

    const responseText = await response.text();
    
    if (!response.ok) {
      console.error('❌ API Error Response:');
      try {
        const errorJson = JSON.parse(responseText);
        console.error(JSON.stringify(errorJson, null, 2));
      } catch {
        console.error(responseText);
      }
      return;
    }

    const data = JSON.parse(responseText);
    console.log('✅ Success! Full response:');
    console.log(JSON.stringify(data, null, 2));
    
    const narration = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (narration) {
      console.log('\n📝 Generated text:');
      console.log(narration);
    }
  } catch (error) {
    console.error('❌ Request failed:', error.message);
    if (error.stack) {
      console.error(error.stack);
    }
  }
}

testGeminiAPI();
