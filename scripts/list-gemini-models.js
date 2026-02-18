/**
 * List available Gemini models
 */
const fs = require('fs');
const path = require('path');

// Load .env.local manually
const envPath = path.join(__dirname, '..', '.env.local');
const envContent = fs.readFileSync(envPath, 'utf8');
const envVars = {};
envContent.split(/\r?\n/).forEach(line => {
  if (line.startsWith('#') || !line.trim()) return;
  const match = line.match(/^([^=]+)=(.*)$/);
  if (match) {
    const key = match[1].trim();
    let value = match[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || 
        (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    envVars[key] = value;
  }
});

const GEMINI_API_KEY = envVars.GEMINI_API_KEY;

async function listModels() {
  console.log('🔍 Listing available Gemini models...\n');
  
  if (!GEMINI_API_KEY) {
    console.error('❌ GEMINI_API_KEY not found');
    return;
  }
  
  const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models?key=${GEMINI_API_KEY}`;
  
  try {
    const response = await fetch(apiUrl);
    
    if (!response.ok) {
      console.error(`❌ Error ${response.status}:`, await response.text());
      return;
    }
    
    const data = await response.json();
    
    console.log('✅ Available models:\n');
    
    if (data.models && data.models.length > 0) {
      data.models.forEach(model => {
        const supportsGenerate = model.supportedGenerationMethods?.includes('generateContent');
        if (supportsGenerate) {
          console.log(`\n📦 ${model.name}`);
          console.log(`   Display Name: ${model.displayName || 'N/A'}`);
          console.log(`   Description: ${model.description || 'N/A'}`);
          console.log(`   Methods: ${model.supportedGenerationMethods?.join(', ') || 'N/A'}`);
        }
      });
    } else {
      console.log('No models found');
    }
  } catch (error) {
    console.error('❌ Request failed:', error.message);
  }
}

listModels();
