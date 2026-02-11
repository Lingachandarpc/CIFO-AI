export const runtime = "nodejs";

import OpenAI from "openai";
import { NextResponse } from "next/server";

export async function POST(req: Request) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    return NextResponse.json({ error: 'Missing API key' }, { status: 501 });
  }

  const openai = new OpenAI({ apiKey: key });

  try {
    const { query, category, narrationTime, narrationType, language } = await req.json();

    const narrativeStyleGuide = {
      "Realistic": "Tell the story in a realistic, factual, and grounded manner with real-world examples.",
      "Dramatic": "Tell the story with dramatic flair, engaging tension, and emotional depth.",
      "Educational": "Tell the story in an educational style, focusing on learning outcomes and key insights."
    };

    const styleInstruction = narrativeStyleGuide[narrationType as keyof typeof narrativeStyleGuide] || narrativeStyleGuide.Realistic;
    const timeDescription = narrationTime <= 2 ? "brief (under 2 minutes)" : narrationTime <= 5 ? "short (2-5 minutes)" : "medium-length (5+ minutes)";

    // If the user is in ASK mode, ask the model to first identify relevant books and case studies
    // that match the user's concern, then provide a short narrated response and a list of matches.
    const userPrompt = category === 'Ask'
      ? `First, identify up to 5 relevant books or case studies (title + short reason) that match this concern: "${query}". Then provide a ${timeDescription} narrated summary addressing the concern, written in ${language} and the ${narrationType} style. Format: start with a short list of matches, then the narration.`
      : `Tell a ${timeDescription} engaging narration about:\n"${query}"\nCategory: ${category}\n\nInstructions:\n- Duration: approximately ${narrationTime} minutes\n- Narrative Style: ${narrationType}\n- Language: ${language}\n- ${styleInstruction}\n- Keep the narration engaging, clear, and suitable for audio playback`;

    const res = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `You are a great storyteller and narrative expert. You create engaging and personalized narrations. 
Style: ${narrationType}
Language: ${language}
${styleInstruction}`,
        },
        {
          role: "user",
          content: userPrompt,
        },
      ],
    });

    return NextResponse.json({
      narration: res.choices[0].message.content,
    });
  } catch (err) {
    console.error("AI API error:", err);
    return NextResponse.json(
      { error: "AI generation failed" },
      { status: 500 }
    );
  }
}
