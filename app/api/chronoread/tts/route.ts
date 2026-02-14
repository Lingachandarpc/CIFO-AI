export const runtime = "nodejs";

import { NextResponse } from "next/server";

export async function POST(req: Request) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    return NextResponse.json({ error: 'Missing API key' }, { status: 501 });
  }

  try {
    const { text, voice } = await req.json();

    const res = await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'tts-1',
        input: text,
        voice,
        response_format: 'mp3',
      }),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      console.error('TTS API error:', res.status, errText);
      return NextResponse.json({ error: 'TTS generation failed' }, { status: 502 });
    }

    const arrayBuffer = await res.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString('base64');

    return NextResponse.json({ audio: base64 });
  } catch (err) {
    console.error('TTS route error:', err);
    return NextResponse.json({ error: 'TTS generation failed' }, { status: 500 });
  }
}
