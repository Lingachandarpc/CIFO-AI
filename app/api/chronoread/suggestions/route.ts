export const runtime = "nodejs";

import OpenAI from "openai";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "../../../services/authOptions";
import { enforceUsagePolicy } from "../../../../lib/usagePolicy";

export async function POST(req: Request) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    return NextResponse.json({ error: 'Missing API key' }, { status: 501 });
  }

  const openai = new OpenAI({ apiKey: key });

  try {
    const session = await getServerSession(authOptions);
    const authEmail = session?.user?.email || null;
    if (authEmail) {
      const policyCheck = await enforceUsagePolicy({
        request: req,
        userEmail: authEmail,
        toolType: "read",
        modelId: process.env.OPENAI_SUGGESTIONS_MODEL || "gpt-3.5-turbo",
      });
      if (!policyCheck.allowed) {
        return policyCheck.response;
      }
    }

    const { query, language, chatHistory, tool, headers } = await req.json();

    const isDashboardMode = String(tool || '').toLowerCase() === 'dashboard';

    const formattedHistory = Array.isArray(chatHistory)
      ? chatHistory
          .slice(-6)
          .map((entry: { role: string; content: string }) => `${entry.role}: ${entry.content}`)
          .join('\n')
      : '';

    const normalizedHeaders = Array.isArray(headers)
      ? headers
          .map((header) => String(header || '').trim())
          .filter(Boolean)
          .slice(0, 20)
      : [];

    const resolvedLanguage = String(language || 'English');

    const prompt = isDashboardMode
      ? `Based on the dashboard request, suggest 6 concise dashboard customization prompts in ${resolvedLanguage}.\n\nRequest: "${query}"\n\nDataset headers: ${normalizedHeaders.length ? normalizedHeaders.join(', ') : 'Unknown'}\n\nRecent conversation:\n${formattedHistory}\n\nRules:\n- Output exactly 6 lines.\n- Each line must be a ready-to-run dashboard command prompt (6-16 words).\n- Focus on chart choice, KPI cards, grouping, sorting, filters, table layout, and theme.\n- Do not include numbering or bullets.\n- No markdown.`
      : `Based on the user's query and recent conversation, suggest 3 concise, relevant follow-up prompts in ${resolvedLanguage}.\n\nQuery: "${query}"\n\nConversation:\n${formattedHistory}\n\nRules:\n- Output exactly 3 lines, each a short suggestion (4-10 words).\n- No numbering or bullets.\n- Keep them specific to the user's interests and prior prompts.\n- ${resolvedLanguage} only.`;

    const messages: OpenAI.ChatCompletionMessageParam[] = [
      {
        role: "system",
        content: isDashboardMode
          ? `You generate dashboard customization prompts that can be directly submitted as dashboard requests in ${resolvedLanguage}.`
          : `You generate short, relevant follow-up suggestions in ${resolvedLanguage}.`,
      },
      {
        role: "user",
        content: prompt,
      },
    ];

    const res = await openai.chat.completions.create({
      model: process.env.OPENAI_SUGGESTIONS_MODEL || "gpt-3.5-turbo",
      messages,
    });

    const raw = res.choices[0].message.content || '';
    const suggestions = raw
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .slice(0, isDashboardMode ? 6 : 3);

    return NextResponse.json({ suggestions });
  } catch (err) {
    console.error("Suggestions API error:", err);
    return NextResponse.json(
      { error: "Suggestion generation failed" },
      { status: 500 }
    );
  }
}
