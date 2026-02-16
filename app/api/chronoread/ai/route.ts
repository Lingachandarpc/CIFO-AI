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
    const { query, category, narrationTime, narrationType, language, interactionMode } = await req.json();
    const parsedNarrationTime = typeof narrationTime === "number" ? narrationTime : Number(narrationTime);
    const resolvedNarrationTime = Number.isFinite(parsedNarrationTime) ? parsedNarrationTime : 1.5;

    const narrativeStyleGuide = {
      "Realistic": "Tell the story in a realistic, factual, and grounded manner with real-world examples.",
      "Dramatic": "Tell the story with dramatic flair, engaging tension, and emotional depth.",
      "Educational": "Tell the story in an educational style, focusing on learning outcomes and key insights."
    };

    const styleInstruction = narrativeStyleGuide[narrationType as keyof typeof narrativeStyleGuide] || narrativeStyleGuide.Realistic;
    const timeDescription = resolvedNarrationTime <= 2 ? "brief (under 2 minutes)" : resolvedNarrationTime <= 5 ? "short (2-5 minutes)" : "medium-length (5+ minutes)";

    const isListenMode = interactionMode === "listen";
    const userInstructions = isListenMode
      ? `
Reply in a conversational chat style that answers the user's question directly.
Rules:
- Plain text only (no markdown, no tables, no emojis, no code blocks).
- 2-5 short sentences.
- Keep it crisp and to the point.
- End with a complete closing sentence.
`
      : `
Tell a ${timeDescription} engaging narration about:
"${query}"
Category: ${category}

Instructions:
- Duration: approximately ${resolvedNarrationTime} minutes
- Narrative Style: ${narrationType}
- Language: ${language}
- ${styleInstruction}
- Keep the narration engaging, clear, and suitable for audio playback
- Target length: 300-500 words (do not count tables, emojis, charts, or diagrams toward the word count)
- Include rich formatting where helpful:
  - At least one table
  - At least one emoji per section
  - One text-based illustration (ASCII art) when it fits
  - One simple chart using text (e.g., bar chart or bullet chart)
  - One tabs block using code fences with language "tabs" and lines starting with "Tab:"
- End with a complete closing sentence, then add this final line:
  Voice Profile: tone=calm|neutral|intense; pace=slow|medium|fast; pitch=low|medium|high; slang=none|light|moderate
`;

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
          content: userInstructions,
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
