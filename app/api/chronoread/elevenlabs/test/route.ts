export const runtime = "nodejs";

import { NextResponse } from "next/server";

interface ElevenLabsVoice {
  name: string;
  voice_id: string;
}

export async function GET() {
  const apiKey = process.env.ELEVENLABS_API_KEY;

  if (!apiKey) {
    return NextResponse.json(
      { error: "ELEVENLABS_API_KEY not configured in environment" },
      { status: 501 }
    );
  }

  try {
    // Test basic API connectivity with voices endpoint
    const res = await fetch("https://api.elevenlabs.io/v1/voices", {
      method: "GET",
      headers: {
        "xi-api-key": apiKey,
      },
    });

    if (!res.ok) {
      const errText = await res.text();
      return NextResponse.json(
        {
          status: "error",
          message: `ElevenLabs API error: ${res.status} ${res.statusText}`,
          details: errText,
          apiKeyPrefix: apiKey.substring(0, 10) + "...",
        },
        { status: 502 }
      );
    }

    const voices = await res.json();
    return NextResponse.json({
      status: "success",
      message: "ElevenLabs API is reachable and responding",
      voiceCount: voices.voices?.length || 0,
      apiKeyPrefix: apiKey.substring(0, 10) + "...",
      sampleVoices: voices.voices?.slice(0, 3).map((v: ElevenLabsVoice) => ({
        name: v.name,
        voice_id: v.voice_id,
      })) || [],
    });
  } catch (error) {
    return NextResponse.json(
      {
        status: "error",
        message: "Failed to connect to ElevenLabs API",
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
