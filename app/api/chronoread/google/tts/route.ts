export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { getGoogleTtsAccessToken, getGoogleTtsApiKey } from "../auth";

export async function POST(req: Request) {
  const accessToken = await getGoogleTtsAccessToken();
  const apiKey = getGoogleTtsApiKey();
  if (!accessToken && !apiKey) {
    return NextResponse.json(
      { error: 'Missing Google TTS credentials. Provide GOOGLE_TTS_SERVICE_ACCOUNT_JSON or GOOGLE_TTS_API_KEY.' },
      { status: 501 }
    );
  }

  try {
    const { text, ssml, voice, languageCode, speakingRate, pitch } = await req.json();

    if ((!text && !ssml) || !voice || !languageCode) {
      return NextResponse.json(
        { error: 'Missing required fields: text, voice, languageCode' },
        { status: 400 }
      );
    }

    const url = new URL('https://texttospeech.googleapis.com/v1/text:synthesize');
    if (!accessToken && apiKey) {
      url.searchParams.set('key', apiKey);
    }

    const makeRequest = async (includePitch: boolean) =>
      fetch(url.toString(), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
        body: JSON.stringify({
          input: ssml ? { ssml } : { text },
          voice: { languageCode, name: voice },
          audioConfig: {
            audioEncoding: 'MP3',
            speakingRate: typeof speakingRate === 'number' ? speakingRate : 1.0,
            ...(includePitch ? { pitch: typeof pitch === 'number' ? pitch : 0 } : {}),
          },
        }),
      });

    let res = await makeRequest(true);

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      let errorDetails = errText;
      try {
        const parsed = JSON.parse(errText);
        errorDetails = parsed?.error?.message || errText;
      } catch {}

      if (typeof errorDetails === 'string' && errorDetails.toLowerCase().includes('does not support pitch')) {
        res = await makeRequest(false);
        if (res.ok) {
          const data = await res.json();
          if (!data?.audioContent) {
            return NextResponse.json({ error: 'Google TTS returned no audio' }, { status: 502 });
          }
          return NextResponse.json({ audio: data.audioContent, mimeType: 'audio/mpeg' });
        }
      }

      if (res.status === 401 && !accessToken && apiKey) {
        return NextResponse.json(
          {
            error: 'Google TTS API key is not accepted for this API. Use OAuth credentials via GOOGLE_TTS_SERVICE_ACCOUNT_JSON.',
          },
          { status: 501 }
        );
      }
      console.error('Google TTS API error:', res.status, errorDetails);
      return NextResponse.json(
        { error: 'Google TTS generation failed', details: errorDetails, status: res.status },
        { status: 502 }
      );
    }

    const data = await res.json();
    if (!data?.audioContent) {
      return NextResponse.json({ error: 'Google TTS returned no audio' }, { status: 502 });
    }

    return NextResponse.json({ audio: data.audioContent, mimeType: 'audio/mpeg' });
  } catch (err) {
    console.error('Google TTS route error:', err);
    return NextResponse.json({ error: 'Google TTS generation failed' }, { status: 500 });
  }
}
