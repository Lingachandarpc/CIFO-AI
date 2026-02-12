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

const run = async () => {
  const results = [];

  if (env.ANTHROPIC_API_KEY) {
    const res = await fetch('https://api.anthropic.com/v1/models', {
      headers: {
        'x-api-key': env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
    });
    const payload = await res.json().catch(() => ({}));
    results.push({ provider: 'Anthropic', status: res.status, payload });
  } else {
    results.push({ provider: 'Anthropic', status: 'missing key' });
  }

  if (env.XAI_API_KEY) {
    const res = await fetch('https://api.x.ai/v1/models', {
      headers: {
        Authorization: `Bearer ${env.XAI_API_KEY}`,
      },
    });
    const payload = await res.json().catch(() => ({}));
    results.push({ provider: 'xAI', status: res.status, payload });
  } else {
    results.push({ provider: 'xAI', status: 'missing key' });
  }

  for (const result of results) {
    if (result.status !== 200) {
      console.log(`${result.provider} status: ${result.status}`);
      if (result.payload) console.log(JSON.stringify(result.payload));
      continue;
    }
    const models = Array.isArray(result.payload?.data)
      ? result.payload.data.map((item) => item.id).filter(Boolean)
      : [];
    console.log(`${result.provider} models: ${models.join(', ')}`);
  }
};

run().catch((err) => {
  const message = err && err.message ? err.message : String(err);
  console.error('Model list failed:', message);
  process.exit(1);
});
