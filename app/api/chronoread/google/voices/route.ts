export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { getGoogleTtsAccessToken, getGoogleTtsApiKey } from "../auth";

export async function GET(req: Request) {
  const accessToken = await getGoogleTtsAccessToken();
  const apiKey = getGoogleTtsApiKey();
  if (!accessToken && !apiKey) {
    return NextResponse.json(
      { error: 'Missing Google TTS credentials. Provide GOOGLE_TTS_SERVICE_ACCOUNT_JSON or GOOGLE_TTS_API_KEY.' },
      { status: 501 }
    );
  }

  try {
    const { searchParams } = new URL(req.url);
    const languageCode = searchParams.get('languageCode') || undefined;
    const url = new URL('https://texttospeech.googleapis.com/v1/voices');
    if (languageCode) {
      url.searchParams.set('languageCode', languageCode);
    }
    if (!accessToken && apiKey) {
      url.searchParams.set('key', apiKey);
    }

    const res = await fetch(url.toString(), {
      method: 'GET',
      headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      if (res.status === 401 && !accessToken && apiKey) {
        return NextResponse.json(
          {
            error: 'Google TTS API key is not accepted for this API. Use OAuth credentials via GOOGLE_TTS_SERVICE_ACCOUNT_JSON.',
          },
          { status: 501 }
        );
      }
      console.error('Google TTS voices error:', res.status, errText);
      return NextResponse.json({ error: 'Failed to fetch Google voices' }, { status: 502 });
    }

    const data = await res.json();
    const voices = Array.isArray(data?.voices) ? data.voices : [];

    return NextResponse.json({
      voices: voices.map((voice: { name: string; languageCodes: string[]; ssmlGender: string; naturalSampleRateHertz?: number }) => ({
        name: voice.name,
        languageCodes: voice.languageCodes,
        ssmlGender: voice.ssmlGender || 'SSML_VOICE_GENDER_UNSPECIFIED',
        naturalSampleRateHertz: voice.naturalSampleRateHertz,
      })),
    });
  } catch (err) {
    console.error('Google TTS voices route error:', err);
    return NextResponse.json({ error: 'Failed to fetch Google voices' }, { status: 500 });
  }
}
