const fs = require('fs');

const envText = fs.readFileSync('.env', 'utf8');
const env = {};

for (const line of envText.split(/\r?\n/)) {
  if (!line) continue;
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) continue;
  const idx = line.indexOf('=');
  if (idx === -1) continue;
  const key = line.slice(0, idx).trim();
  let val = line.slice(idx + 1).trim();
  if (val.startsWith('"') && val.endsWith('"')) {
    val = val.slice(1, -1);
  } else if (val.startsWith("'") && val.endsWith("'")) {
    val = val.slice(1, -1);
  }
  env[key] = val;
}

const keys = ['OPENAI_API_KEY', 'ANTHROPIC_API_KEY', 'XAI_API_KEY'];
const missing = keys.filter((key) => !env[key]);

if (missing.length) {
  console.log('Missing keys:', missing.join(','));
  process.exit(1);
}

const run = async () => {
  const results = [];

  const openai = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'gpt-3.5-turbo',
      messages: [{ role: 'user', content: 'Reply with OK.' }],
    }),
  });
  if (!openai.ok) {
    const error = await openai.text();
    results.push(['OpenAI', `${openai.status} ${error}`]);
  } else {
    results.push(['OpenAI', openai.status]);
  }

  const anthropic = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 32,
      system: '',
      messages: [{ role: 'user', content: 'Reply with OK.' }],
    }),
  });
  if (!anthropic.ok) {
    const error = await anthropic.text();
    results.push(['Anthropic', `${anthropic.status} ${error}`]);
  } else {
    results.push(['Anthropic', anthropic.status]);
  }

  const xai = await fetch('https://api.x.ai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${env.XAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'grok-3',
      messages: [{ role: 'user', content: 'Reply with OK.' }],
    }),
  });
  if (!xai.ok) {
    const error = await xai.text();
    results.push(['xAI', `${xai.status} ${error}`]);
  } else {
    results.push(['xAI', xai.status]);
  }

  console.log(results.map((item) => `${item[0]} status: ${item[1]}`).join('\n'));
};

run().catch((err) => {
  const message = err && err.message ? err.message : String(err);
  console.error('Sanity check failed:', message);
  process.exit(1);
});
