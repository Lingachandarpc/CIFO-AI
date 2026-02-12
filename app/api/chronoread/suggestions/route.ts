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
    const { query, language, chatHistory } = await req.json();

    const formattedHistory = Array.isArray(chatHistory)
      ? chatHistory
          .slice(-6)
          .map((entry: { role: string; content: string }) => `${entry.role}: ${entry.content}`)
          .join('\n')
      : '';

    const prompt = `Based on the user's query and recent conversation, suggest 3 concise, relevant follow-up prompts in ${language}.\n\nQuery: "${query}"\n\nConversation:\n${formattedHistory}\n\nRules:\n- Output exactly 3 lines, each a short suggestion (4-10 words).\n- No numbering or bullets.\n- Keep them specific to the user's interests and prior prompts.\n- ${language} only.`;

    const res = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        {
          role: "system",
          content: `You generate short, relevant follow-up suggestions in ${language}.`,
        },
        {
          role: "user",
          content: prompt,
        },
      ],
    });

    const raw = res.choices[0].message.content || '';
    const suggestions = raw
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .slice(0, 3);

    return NextResponse.json({ suggestions });
  } catch (err) {
    console.error("Suggestions API error:", err);
    return NextResponse.json(
      { error: "Suggestion generation failed" },
      { status: 500 }
    );
  }
}
