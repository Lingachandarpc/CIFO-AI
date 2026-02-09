export const runtime = "nodejs";

import OpenAI from "openai";
import { NextResponse } from "next/server";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
});

export async function POST(req: Request) {
  try {
    const { query, category } = await req.json();

    const res = await openai.chat.completions.create({
      model: "gpt-4.1-mini",
      messages: [
        {
          role: "system",
          content: "You are a great storyteller.",
        },
        {
          role: "user",
          content: `
Tell a short, engaging narration about:
"${query}"
Category: ${category}

Style: friendly, simple, 1–2 minutes.
`,
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
