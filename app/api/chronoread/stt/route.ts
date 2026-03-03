export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "../../../services/authOptions";
import * as fs from "fs";
import * as path from "path";
import { execSync } from "child_process";
import { enforceUsagePolicy } from "../../../../lib/usagePolicy";

export async function POST(req: Request) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "Missing API key" }, { status: 501 });
  }

  try {
    const session = await getServerSession(authOptions);
    const authEmail = session?.user?.email || null;
    if (authEmail) {
      const policyCheck = await enforceUsagePolicy({
        request: req,
        userEmail: authEmail,
        toolType: "listen",
        modelId: "whisper-1",
      });
      if (!policyCheck.allowed) {
        return policyCheck.response;
      }
    }

    const formData = await req.formData();
    const audioFile = formData.get("file") as File | null;
    const language = formData.get("language") as string | null;

    if (!audioFile) {
      return NextResponse.json(
        { error: "No audio file provided" },
        { status: 400 }
      );
    }

    // Convert webm to mp3 for Whisper API
    const buffer = Buffer.from(await audioFile.arrayBuffer());
    const tempInputPath = path.join("/tmp", `audio_${Date.now()}.webm`);
    const tempOutputPath = path.join("/tmp", `audio_${Date.now()}.mp3`);

    fs.writeFileSync(tempInputPath, buffer);

    // Convert using ffmpeg (ensure it's installed)
    try {
      execSync(`ffmpeg -i ${tempInputPath} -q:a 9 -n ${tempOutputPath}`, {
        stdio: "ignore",
      });
    } catch {
      // If ffmpeg is not available, use original file
      // Whisper supports webm, so it should work
      return transcribeWithWhisper(buffer, language, apiKey);
    }

    const mp3Buffer = fs.readFileSync(tempOutputPath);

    // Clean up temp files
    fs.unlinkSync(tempInputPath);
    fs.unlinkSync(tempOutputPath);

    return transcribeWithWhisper(mp3Buffer, language, apiKey);
  } catch (err) {
    console.error("STT route error:", err);
    return NextResponse.json(
      { error: "Transcription failed" },
      { status: 500 }
    );
  }
}

async function transcribeWithWhisper(
  audioBuffer: Buffer,
  language: string | null,
  apiKey: string
): Promise<NextResponse> {
  try {
    const formData = new FormData();

    const arrayBuffer = new ArrayBuffer(audioBuffer.length);
    const view = new Uint8Array(arrayBuffer);
    for (let i = 0; i < audioBuffer.length; ++i) {
      view[i] = audioBuffer[i];
    }
    formData.append("file", new Blob([view]), "audio.mp3");
    formData.append("model", "whisper-1");
    formData.append("temperature", "0");

    if (language) {
      formData.append("language", language);
    }

    const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      body: formData,
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      console.error("Whisper API error:", res.status, errText);
      return NextResponse.json(
        { error: `Whisper API error: ${res.status}` },
        { status: 502 }
      );
    }

    const data = await res.json();
    return NextResponse.json({ text: data.text || "" });
  } catch (err) {
    console.error("Whisper transcription error:", err);
    return NextResponse.json(
      { error: "Transcription failed" },
      { status: 500 }
    );
  }
}
