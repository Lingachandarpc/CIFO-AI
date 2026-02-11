export const runtime = "nodejs";

import { NextResponse } from "next/server";

export async function POST(req: Request) {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'Missing ElevenLabs API key' }, { status: 501 });
  }

  try {
    const { text, voiceId, stability, similarity_boost } = await req.json();

    if (!text || !voiceId) {
      return NextResponse.json(
        { error: 'Missing required fields: text, voiceId' },
        { status: 400 }
      );
    }

    // Legacy API endpoint with voice settings
    const url = `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`;

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'xi-api-key': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text,
        model_id: 'eleven_multilingual_v2', // Supports multiple languages better
        voice_settings: {
          stability: stability || 0.5,
          similarity_boost: similarity_boost || 0.75,
        },
      }),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '(no response body)');
      console.error('ElevenLabs API error:', {
        status: res.status,
        statusText: res.statusText,
        body: errText,
        voiceId,
        url,
      });
      return NextResponse.json(
        { error: `ElevenLabs API error: ${res.status} ${res.statusText}`, details: errText },
        { status: 502 }
      );
    }

    const arrayBuffer = await res.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString('base64');

    return NextResponse.json({ audio: base64 });
  } catch (err) {
    console.error('ElevenLabs TTS route error:', err);
    return NextResponse.json(
      { error: 'TTS generation failed' },
      { status: 500 }
    );
  }
}
