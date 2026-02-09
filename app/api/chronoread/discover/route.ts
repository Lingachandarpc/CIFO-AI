export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import OpenAI from "openai";
import { NextResponse } from "next/server";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
});

const categories = ["Case Study", "Real Life Story", "Book"];

type TopicWithImage = {
  title: string;
  image: string;
};

export async function GET() {
  try {
    const res = await openai.chat.completions.create({
      model: "gpt-4.1-mini",
      messages: [
        {
          role: "system",
          content:
            "Generate familiar, popular topics. Return STRICT JSON only.",
        },
        {
          role: "user",
          content: `
Return 4 topics for each category below.

Categories:
${categories.join(", ")}

JSON format:
{
  "Case Study": ["Topic 1", "Topic 2"],
  "Real Life Story": ["Topic 1", "Topic 2"],
  "Book": ["Topic 1", "Topic 2"]
}
`,
        },
      ],
    });

    const raw = res.choices[0]?.message?.content;
    if (!raw) throw new Error("Empty AI response");

    const parsed = JSON.parse(raw) as Record<string, string[]>;

    const result: Record<string, { title: string; image: string }[]> = {};

    for (const [category, titles] of Object.entries(parsed)) {
      result[category] = await Promise.all(
  titles.map(async (title) => {
    try {
      // OpenAI image generation for poster
      const imageRes = await openai.images.generate({
        model: "gpt-image-1",
        prompt: `${title} poster, ${category}, colorful, cinematic, eye-catching, high-quality graphic design`,
        size: "1024x1024",
      });

      // Safely get URL with optional chaining and fallback
      const imageUrl = imageRes?.data?.[0]?.url || `https://picsum.photos/seed/${encodeURIComponent(title)}/400/400`;

      return {
        title,
        image: imageUrl,
      };
    } catch (err) {
      console.error(`Failed to generate image for ${title}:`, err);
      return {
        title,
        image: `https://picsum.photos/seed/${encodeURIComponent(title)}/400/400`, // fallback
      };
    }
  })
);

    }

    return NextResponse.json(result);
  } catch (err) {
    console.error("Discover API error:", err);
    return NextResponse.json(
      { error: "Failed to load discovery content" },
      { status: 500 }
    );
  }
}

