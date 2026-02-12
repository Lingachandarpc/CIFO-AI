export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import OpenAI from "openai";
import { NextResponse } from "next/server";

const categories = ["Case Study", "Real Life Story", "Book"];

type TopicWithImage = {
  title: string;
  image: string;
};

export async function GET() {
  try {
    const key = process.env.OPENAI_API_KEY;
    const openai = key ? new OpenAI({ apiKey: key }) : null;

    let parsed: Record<string, string[]>;

    if (!openai) {
      // Fallback static topics when no API key is present — allows UI to run without consuming tokens
      parsed = {
        "Case Study": ["The Rise of Remote Work", "Sustainable Urban Farming", "AI in Healthcare", "Micro-entrepreneurship"],
        "Real Life Story": ["A Teacher's Journey", "Startup Founder's Struggle", "A Community Rebuild", "From Hobby to Business"],
        "Book": ["Atomic Habits", "Deep Work", "Sapiens", "The Alchemist"],
      };
    } else {
      const messages: OpenAI.ChatCompletionMessageParam[] = [
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
      ];

      const res = await openai.chat.completions.create({
        model: "gpt-3.5-turbo",
        messages,
      });

      const raw = res.choices[0]?.message?.content;
      if (!raw) throw new Error("Empty AI response");
      parsed = JSON.parse(raw) as Record<string, string[]>;
    }

    const result: Record<string, { title: string; image: string }[]> = {};

    for (const [category, titles] of Object.entries(parsed)) {
      result[category] = await Promise.all(
        titles.map(async (title) => {
          try {
            if (!openai) {
              return {
                title,
                image: `https://picsum.photos/seed/${encodeURIComponent(title)}/400/400`,
              };
            }

            // OpenAI image generation for poster
            // const imageRes = await openai.images.generate({
            //   model: "gpt-image-1",
            //   prompt: `${title} poster, ${category}, colorful, cinematic, eye-catching, high-quality graphic design`,
            //   size: "1024x1024",
            // });

            const imageUrl = `https://picsum.photos/seed/${encodeURIComponent(title)}/400/400`;

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

