export const runtime = "nodejs";

import { NextResponse } from "next/server";

/**
 * Gemini TTS API Route
 * Uses the Gemini 2.5 Flash Preview TTS model to generate speech.
 * Endpoint: POST /api/chronoread/gemini/tts
 *
 * Request body:
 *   { text: string, voiceName: string, language?: string }
 *
 * Response:
 *   { audio: string }  (base64-encoded audio, WAV or PCM format)
 *
 * Environment variable required: GEMINI_API_KEY
 */

const GEMINI_TTS_MODEL = "gemini-2.5-flash-preview-tts";
const GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta/models";

export async function POST(req: Request) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "GEMINI_API_KEY not configured" },
      { status: 501 }
    );
  }

  try {
    const { text, voiceName, language } = await req.json();

    if (!text) {
      return NextResponse.json(
        { error: "Missing required field: text" },
        { status: 400 }
      );
    }

    const resolvedVoice = voiceName || "Kore";

    // Build the prompt — for non-English, instruct the model to speak in the target language
    let ttsPrompt = text;
    if (language && language !== "English") {
      ttsPrompt = `Say the following in ${language}: ${text}`;
    }

    const url = `${GEMINI_API_BASE}/${GEMINI_TTS_MODEL}:generateContent?key=${apiKey}`;

    const requestBody = {
      contents: [
        {
          parts: [{ text: ttsPrompt }],
        },
      ],
      generationConfig: {
        responseModalities: ["AUDIO"],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: {
              voiceName: resolvedVoice,
            },
          },
        },
      },
    };

    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "");
      let errorDetails = errorText;
      try {
        const parsed = JSON.parse(errorText);
        errorDetails = parsed?.error?.message || errorText;
      } catch {
        // keep raw error text
      }
      console.error("Gemini TTS API error:", response.status, errorDetails);
      return NextResponse.json(
        { error: "Gemini TTS generation failed", details: errorDetails, status: response.status },
        { status: response.status >= 400 && response.status < 600 ? response.status : 502 }
      );
    }

    const data = await response.json();

    // Extract audio from the Gemini response
    // Response shape: { candidates: [{ content: { parts: [{ inlineData: { mimeType, data } }] } }] }
    const candidates = data?.candidates;
    if (!candidates || candidates.length === 0) {
      console.error("Gemini TTS returned no candidates");
      return NextResponse.json(
        { error: "Gemini TTS returned no audio candidates" },
        { status: 502 }
      );
    }

    const parts = candidates[0]?.content?.parts;
    if (!parts || parts.length === 0) {
      console.error("Gemini TTS returned no parts");
      return NextResponse.json(
        { error: "Gemini TTS returned no audio data" },
        { status: 502 }
      );
    }

    // Find the part with inline audio data
    const audioPart = parts.find(
      (p: { inlineData?: { mimeType: string; data: string } }) => p.inlineData?.data
    );

    if (!audioPart?.inlineData?.data) {
      console.error("Gemini TTS returned no inline audio data");
      return NextResponse.json(
        { error: "Gemini TTS response missing audio content" },
        { status: 502 }
      );
    }

    const mimeType: string = audioPart.inlineData.mimeType || "";
    const rawBase64: string = audioPart.inlineData.data;

    console.log(`[Gemini TTS] Response mimeType: "${mimeType}", audio data length: ${rawBase64.length}`);

    // Gemini TTS returns raw PCM (audio/L16;rate=24000) or other raw formats.
    // Web Audio API's decodeAudioData needs a container format (WAV/MP3/OGG).
    // Detect by checking actual bytes instead of just mimeType for robustness.
    const rawBytes = Buffer.from(rawBase64, "base64");

    // Check if data already has a valid container header
    const hasRiffHeader = rawBytes.length >= 4 && rawBytes.toString("ascii", 0, 4) === "RIFF";
    const hasMp3Header = rawBytes.length >= 3 && (
      (rawBytes[0] === 0xFF && (rawBytes[1] & 0xE0) === 0xE0) || // MP3 sync word
      rawBytes.toString("ascii", 0, 3) === "ID3"                  // ID3 tag
    );
    const hasOggHeader = rawBytes.length >= 4 && rawBytes.toString("ascii", 0, 4) === "OggS";

    const isAlreadyContainer = hasRiffHeader || hasMp3Header || hasOggHeader;

    let outputBase64 = rawBase64;

    if (!isAlreadyContainer) {
      // Raw PCM audio — wrap in a WAV container
      const rateMatch = mimeType.match(/rate=(\d+)/);
      const sampleRate = rateMatch ? parseInt(rateMatch[1], 10) : 24000;
      const channels = 1;
      const bitsPerSample = 16;
      const pcmLength = rawBytes.length;
      const wavHeaderSize = 44;
      const wavBuffer = Buffer.alloc(wavHeaderSize + pcmLength);

      // RIFF header
      wavBuffer.write("RIFF", 0);
      wavBuffer.writeUInt32LE(36 + pcmLength, 4);
      wavBuffer.write("WAVE", 8);

      // fmt sub-chunk
      wavBuffer.write("fmt ", 12);
      wavBuffer.writeUInt32LE(16, 16);
      wavBuffer.writeUInt16LE(1, 20);        // PCM format
      wavBuffer.writeUInt16LE(channels, 22);
      wavBuffer.writeUInt32LE(sampleRate, 24);
      wavBuffer.writeUInt32LE(sampleRate * channels * (bitsPerSample / 8), 28);
      wavBuffer.writeUInt16LE(channels * (bitsPerSample / 8), 32);
      wavBuffer.writeUInt16LE(bitsPerSample, 34);

      // data sub-chunk
      wavBuffer.write("data", 36);
      wavBuffer.writeUInt32LE(pcmLength, 40);
      rawBytes.copy(wavBuffer, wavHeaderSize);

      outputBase64 = wavBuffer.toString("base64");

      console.log(`[Gemini TTS] Wrapped raw PCM → WAV (${sampleRate}Hz, ${channels}ch, ${bitsPerSample}bit, ${pcmLength} bytes)`);
    } else {
      console.log(`[Gemini TTS] Audio already in container format (${hasRiffHeader ? "WAV" : hasMp3Header ? "MP3" : "OGG"})`);
    }

    return NextResponse.json({
      audio: outputBase64,
      mimeType: isAlreadyContainer ? (mimeType || "audio/wav") : "audio/wav",
    });
  } catch (error) {
    console.error("Gemini TTS route error:", error);
    return NextResponse.json(
      { error: "Gemini TTS generation failed" },
      { status: 500 }
    );
  }
}
