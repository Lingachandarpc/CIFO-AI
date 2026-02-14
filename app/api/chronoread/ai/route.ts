export const runtime = "nodejs";

import OpenAI from "openai";
import { NextResponse } from "next/server";
import { AIModel } from "../../../types";
import { buildPromptTemplate, PromptUserContext } from "./promptTemplate";

type ProviderKey = "openai" | "anthropic" | "xai";

const MODEL_CONFIG: Record<AIModel, { provider: ProviderKey; model: string; envKey: string }> = {
  [AIModel.OPENAI]: { provider: "openai", model: "gpt-3.5-turbo", envKey: "OPENAI_API_KEY" },
  [AIModel.CLAUDE_SONNET]: { provider: "anthropic", model: "claude-sonnet-4-5-20250929", envKey: "ANTHROPIC_API_KEY" },
  [AIModel.XAI]: { provider: "xai", model: "grok-3", envKey: "XAI_API_KEY" },
  [AIModel.AUTO]: { provider: "openai", model: "gpt-3.5-turbo", envKey: "OPENAI_API_KEY" },
};

const MODEL_STYLE_HINTS: Record<AIModel, string> = {
  [AIModel.OPENAI]: "Prefer crisp structure, short sentences, and bullet points when helpful.",
  [AIModel.CLAUDE_SONNET]: "Use clear headings, consistent formatting, and careful factual phrasing.",
  [AIModel.XAI]: "Be direct, pragmatic, and emphasize actionable insights.",
  [AIModel.AUTO]: "",
};

const MODEL_LATENCY: Partial<Record<AIModel, { avgMs: number; count: number }>> = {};

const GENERATION_MODEL_ORDER: AIModel[] = [AIModel.OPENAI, AIModel.CLAUDE_SONNET, AIModel.XAI];

const toModelKey = (value: unknown): AIModel => {
  if (typeof value !== "string") return AIModel.AUTO;
  const normalized = value.trim().toLowerCase();
  switch (normalized) {
    case AIModel.OPENAI:
      return AIModel.OPENAI;
    case AIModel.CLAUDE_SONNET:
    case "claude":
    case "claude-sonnet":
      return AIModel.CLAUDE_SONNET;
    case AIModel.XAI:
    case "xai":
      return AIModel.XAI;
    default:
      return AIModel.AUTO;
  }
};

const getAvailableModels = () =>
  GENERATION_MODEL_ORDER.filter((model) => {
    const config = MODEL_CONFIG[model];
    return !!process.env[config.envKey];
  });

const detectCategory = (query: string, userCategory: string): string => {
  // If user explicitly set case study, keep it
  if (userCategory === 'Case Study') return 'Case Study';
  
  // Auto-detect based on query content
  const lowerQuery = query.toLowerCase();
  
  // Book indicators
  const bookKeywords = ['book', 'novel', 'author', 'read', 'chapter', 'isbn', 'publisher', 'bestseller', 'fiction', 'non-fiction', 'biography', 'memoir'];
  const hasBookIndicators = bookKeywords.some(keyword => lowerQuery.includes(keyword));
  
  // Case study indicators
  const caseStudyKeywords = ['case study', 'study', 'research', 'analysis', 'example', 'scenario', 'business case', 'company', 'startup', 'industry', 'market', 'strategy', 'problem', 'solution'];
  const hasCaseStudyIndicators = caseStudyKeywords.some(keyword => lowerQuery.includes(keyword));
  
  // If has book indicators and no case study indicators, use Book
  if (hasBookIndicators && !hasCaseStudyIndicators) return 'Book';
  
  // If has case study indicators, use Case Study
  if (hasCaseStudyIndicators) return 'Case Study';
  
  // Default to Book for general queries
  return 'Book';
};

const selectAutoModels = (available: AIModel[]) => {
  const scored = available.map((model) => ({
    model,
    avgMs: MODEL_LATENCY[model]?.avgMs,
  }));
  const hasKnown = scored.some((item) => typeof item.avgMs === "number");
  if (!hasKnown) return available;
  return scored
    .sort((a, b) => (a.avgMs ?? Number.POSITIVE_INFINITY) - (b.avgMs ?? Number.POSITIVE_INFINITY))
    .map((item) => item.model);
};

const recordLatency = (model: AIModel, durationMs: number) => {
  const current = MODEL_LATENCY[model];
  if (!current) {
    MODEL_LATENCY[model] = { avgMs: durationMs, count: 1 };
    return;
  }
  const nextAvg = current.avgMs * 0.7 + durationMs * 0.3;
  MODEL_LATENCY[model] = { avgMs: nextAvg, count: current.count + 1 };
};

const buildAnthropicMessages = (messages: OpenAI.ChatCompletionMessageParam[]) =>
  messages
    .filter((message) => message.role !== "system")
    .map((message) => ({
      role: message.role === "assistant" ? "assistant" : "user",
      content: typeof message.content === "string" ? message.content : JSON.stringify(message.content),
    }));

const requestOpenAI = async (model: string, messages: OpenAI.ChatCompletionMessageParam[]) => {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("Missing OpenAI API key");
  const openai = new OpenAI({ apiKey: key });
  const res = await openai.chat.completions.create({
    model,
    messages,
  });
  return res.choices[0]?.message?.content || "";
};

const requestAnthropic = async (
  model: string,
  messages: OpenAI.ChatCompletionMessageParam[],
  systemPrompt: string,
  maxTokens: number
) => {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("Missing Anthropic API key");

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      system: systemPrompt,
      messages: buildAnthropicMessages(messages),
    }),
  });

  if (!res.ok) {
    const payload = await res.json().catch(() => ({}));
    throw new Error(`Anthropic error: ${res.status} ${JSON.stringify(payload)}`);
  }

  const data = await res.json();
  if (Array.isArray(data.content)) {
    return data.content.map((block: { text?: string }) => block.text || "").join("");
  }
  return data.content?.text || "";
};

const requestXai = async (model: string, messages: OpenAI.ChatCompletionMessageParam[]) => {
  const key = process.env.XAI_API_KEY;
  if (!key) throw new Error("Missing xAI API key");
  const res = await fetch("https://api.x.ai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model,
      messages,
    }),
  });

  if (!res.ok) {
    const payload = await res.json().catch(() => ({}));
    throw new Error(`xAI error: ${res.status} ${JSON.stringify(payload)}`);
  }

  const data = await res.json();
  return data.choices?.[0]?.message?.content || "";
};

export async function POST(req: Request) {
  try {
    const {
      query,
      category: userCategory,
      narrationTime,
      narrationType,
      language,
      interactionMode,
      continuation,
      chatHistory,
      userContext,
      aiModel,
    } = await req.json();
    
    // Auto-detect category based on query content
    const category = detectCategory(query, userCategory);
    const requestedModel = toModelKey(aiModel);
    const availableModels = getAvailableModels();

    if (availableModels.length === 0) {
      return NextResponse.json({ error: 'Missing API key' }, { status: 501 });
    }

    if (requestedModel !== AIModel.AUTO && !availableModels.includes(requestedModel)) {
      return NextResponse.json({ error: 'Requested model is not configured' }, { status: 501 });
    }

    const narrativeStyleGuide = {
      "Realistic": "Tell the story in a realistic, factual, and grounded manner with real-world examples.",
      "Dramatic": "Tell the story with dramatic flair, engaging tension, and emotional depth.",
      "Educational": "Tell the story in an educational style, focusing on learning outcomes and key insights."
    };

    const styleInstruction = narrativeStyleGuide[narrationType as keyof typeof narrativeStyleGuide] || narrativeStyleGuide.Realistic;
    const timeDescription = narrationTime <= 2 ? "brief (under 2 minutes)" : narrationTime <= 5 ? "short (2-5 minutes)" : "medium-length (5+ minutes)";

    const isListenMode = interactionMode === 'listen';
    const wordsPerMinute = isListenMode ? 150 : 130;
    const targetWords = Math.max(120, narrationTime * wordsPerMinute);
    const maxWords = Math.max(150, Math.round(targetWords * 1.1));
    const promptTemplate = buildPromptTemplate({
      query,
      category,
      language,
      interactionMode: isListenMode ? "listen" : "read",
      userContext: (userContext as PromptUserContext | undefined),
      chatHistory: Array.isArray(chatHistory) ? chatHistory : [],
    });
    const listenGuidance = promptTemplate.listenGuidance;
    const sourceCoverageInstruction = promptTemplate.sourceCoverageInstruction;
    const outputContract = promptTemplate.outputContract;
    const languageEnforcement = promptTemplate.languageEnforcement;
    const personalizationInstruction = promptTemplate.personalizationInstruction;
    const isCaseStudy = category === 'Case Study';
    const caseStudyInstruction = isCaseStudy
      ? `Case Study format (required):\n- Use dynamic, context-specific headings based on the query.\n- Do NOT force static templates or fixed headings like Problem/Solution/Reference/Action Points/Example.\n- Keep each section concise: 2-4 bullets or 1-3 short sentences.`
      : '';
    const listenCaseStudyInstruction = isCaseStudy
      ? `Apply the same case study constraints while preserving the output contract.`
      : '';

    const formattedHistory = Array.isArray(chatHistory)
      ? chatHistory
          .slice(-6)
          .map((entry: { role: string; content: string }) => `${entry.role}: ${entry.content}`)
          .join('\n')
      : '';

    const continuationPrompt = continuation?.previousNarration
      ? `Continue the narration without restarting. Prior narration:\n"""${continuation.previousNarration}"""\n` +
        (continuation.userInterruption
          ? `The user interrupted with: "${continuation.userInterruption}". Respond briefly to the interruption using the same source context, then continue the narration seamlessly.\n`
          : '') +
        `${languageEnforcement}\n`
      : '';

    // If the user is in ASK mode, ask the model to first identify relevant books and case studies
    // that match the user's concern, then provide a short narrated response and a list of matches.
    const userPrompt = category === 'Ask'
      ? `Identify up to 5 relevant books or case studies (title + short reason) that match this concern: "${query}". Then provide a ${timeDescription} response addressing the concern, written in ${language} and the ${narrationType} style. Format: start with a short list of matches, then the narration.\n- Aim for about ${targetWords} words, maximum ${maxWords}.\n- ${languageEnforcement}`
      : `Provide a ${timeDescription} narration that directly addresses the user's query:\n"${query}"\nCategory: ${category}\n\nInstructions:\n- Aim for about ${targetWords} words, maximum ${maxWords}.\n- Duration: approximately ${narrationTime} minutes\n- Narrative Style: ${narrationType}\n- Language: ${language}\n- ${styleInstruction}\n- ${sourceCoverageInstruction}\n- ${personalizationInstruction}\n- Do not invent sources or facts; stay grounded in known references related to the query. If the query is unclear, ask a brief clarifying question in one sentence while still giving a relevant, general answer.\n- Keep the narration engaging, clear, and suitable for reading and audio playback\n${caseStudyInstruction ? `- ${caseStudyInstruction}\n` : ''}- ${outputContract}\n- ${languageEnforcement}`;

    const listenPrompt = `${continuationPrompt}Provide a ${timeDescription} narration that directly addresses the user's query:\n"${query}"\nCategory: ${category}\n\nInstructions:\n- Aim for about ${targetWords} words, maximum ${maxWords}.\n- Duration: approximately ${narrationTime} minutes\n- Narrative Style: ${narrationType}\n- Language: ${language}\n- ${styleInstruction}\n- ${listenGuidance}\n- ${sourceCoverageInstruction}\n- ${personalizationInstruction}\n${listenCaseStudyInstruction ? `- ${listenCaseStudyInstruction}\n` : ''}- ${outputContract}\n- Add a FINAL machine line for voice synthesis only: Voice Profile: genre=<short label>; tone=<calm|neutral|intense>; pace=<slow|medium|fast>; pitch=<low|medium|high>; slang=<none|light|moderate>\n- This Voice Profile line must be the last line.\n- ${languageEnforcement}`;

    const baseSystemPrompt = `You are a grounded narrator and research assistant. You answer the user's request directly using real sources and avoid fabrication.
Style: ${narrationType}
Language: ${language}
${styleInstruction}
${sourceCoverageInstruction}
${personalizationInstruction}
${outputContract}
${languageEnforcement}`;

    const buildMessages = (systemPrompt: string): OpenAI.ChatCompletionMessageParam[] => {
      const messages: OpenAI.ChatCompletionMessageParam[] = [
        {
          role: "system",
          content: systemPrompt,
        },
      ];

      if (formattedHistory) {
        messages.push({
          role: "user",
          content: `Conversation context (most recent):\n${formattedHistory}`,
        });
      }

      messages.push({
        role: "user",
        content: isListenMode ? listenPrompt : userPrompt,
      });

      return messages;
    };

    const candidateModels = requestedModel === AIModel.AUTO
      ? selectAutoModels(availableModels)
      : [requestedModel];

    const maxTokens = Math.min(2048, Math.max(512, Math.round(maxWords * 1.6)));
    const runModel = async (
      model: AIModel,
      messages: OpenAI.ChatCompletionMessageParam[],
      systemPrompt: string
    ) => {
      const config = MODEL_CONFIG[model];
      if (config.provider === "openai") {
        return requestOpenAI(config.model, messages);
      }
      if (config.provider === "anthropic") {
        return requestAnthropic(config.model, messages, systemPrompt, maxTokens);
      }
      return requestXai(config.model, messages);
    };

    let initialNarration = '';
    let lastError: unknown = null;
    let usedModel: AIModel | null = null;

    for (const model of candidateModels) {
      const systemPrompt = `${baseSystemPrompt}\n${MODEL_STYLE_HINTS[model]}`.trim();
      const messages = buildMessages(systemPrompt);
      const start = Date.now();

      try {
        const content = await runModel(model, messages, systemPrompt);

        if (!content) {
          throw new Error("Empty response from model");
        }

        recordLatency(model, Date.now() - start);
        initialNarration = content;
        usedModel = model;
        break;
      } catch (error) {
        lastError = error;
        console.error(`AI model ${model} failed:`, error);
      }
    }

    if (!initialNarration || !usedModel) {
      console.error("All AI model attempts failed:", lastError);
      return NextResponse.json(
        { error: "AI generation failed" },
        { status: 500 }
      );
    }

    const scriptRegexByLanguage: Record<string, RegExp> = {
      Tamil: /[\u0B80-\u0BFF]/,
      Telugu: /[\u0C00-\u0C7F]/,
      Malayalam: /[\u0D00-\u0D7F]/,
      Kannada: /[\u0C80-\u0CFF]/,
      Bengali: /[\u0980-\u09FF]/,
      Hindi: /[\u0900-\u097F]/,
      Marathi: /[\u0900-\u097F]/,
      Gujarati: /[\u0A80-\u0AFF]/,
      Punjabi: /[\u0A00-\u0A7F]/,
      Chinese: /[\u4E00-\u9FFF]/,
      Japanese: /[\u3040-\u30FF\u4E00-\u9FFF]/,
    };

    const needsScriptRetry = (text: string) => {
      const regex = scriptRegexByLanguage[language as keyof typeof scriptRegexByLanguage];
      if (!regex) return false;
      return !regex.test(text);
    };

    const trimToWordLimit = (text: string, limit: number, listenMode: boolean) => {
      const normalized = text.trim();
      if (!normalized) return text;
      const words = normalized.split(/\s+/).filter(Boolean);
      if (words.length <= limit && !listenMode) return text;

      if (!listenMode) {
        return words.slice(0, limit).join(' ');
      }

      const lines = normalized.split(/\r?\n/).filter((line) => line.trim().length > 0);
      const voiceProfileLine = [...lines].reverse().find((line) => line.trim().toLowerCase().startsWith('voice profile:')) || '';
      const suggestionLine = [...lines].reverse().find((line) => line.trim().toLowerCase().startsWith('suggested next topics:')) || '';
      const bodyLines = lines.filter((line) => line !== voiceProfileLine && line !== suggestionLine);
      const preservedWords = `${voiceProfileLine} ${suggestionLine}`.trim().split(/\s+/).filter(Boolean).length;
      const remaining = Math.max(10, limit - preservedWords);
      const bodyWords = bodyLines.join(' ').trim().split(/\s+/).filter(Boolean);
      const trimmedBody = bodyWords.slice(0, remaining).join(' ');
      const rebuilt = [trimmedBody, suggestionLine, voiceProfileLine].filter(Boolean).join('\n');
      return rebuilt || normalized;
    };

    let finalNarration = initialNarration;
    if (needsScriptRetry(initialNarration)) {
      const rewritePrompt = `Rewrite the following narration so it is fully in ${language} using its native script only.\n` +
        `If this is listen mode, keep the tags "Suggested Next Topics:" and "Voice Profile:" in English exactly as tags, but translate everything else.\n\n` +
        `Narration to rewrite:\n"""${initialNarration}"""`;

      const rewriteSystemPrompt = `You strictly follow the requested language and script. ${languageEnforcement}\n${MODEL_STYLE_HINTS[usedModel]}`.trim();
      const retryMessages: OpenAI.ChatCompletionMessageParam[] = [
        {
          role: "system",
          content: rewriteSystemPrompt,
        },
        {
          role: "user",
          content: rewritePrompt,
        },
      ];

      const retryContent = await runModel(usedModel, retryMessages, rewriteSystemPrompt);
      finalNarration = retryContent || initialNarration;

      if (needsScriptRetry(finalNarration)) {
        const translatePrompt = `Translate the following text into ${language}. Output ONLY ${language} in its native script.\n` +
          `If this is listen mode, keep the tags "Suggested Next Topics:" and "Voice Profile:" in English exactly as tags, but translate everything else.\n\n` +
          `Text to translate:\n"""${finalNarration}"""`;

        const translateSystemPrompt = `You output only ${language} in native script. ${languageEnforcement}\n${MODEL_STYLE_HINTS[usedModel]}`.trim();
        const finalRetryMessages: OpenAI.ChatCompletionMessageParam[] = [
          {
            role: "system",
            content: translateSystemPrompt,
          },
          {
            role: "user",
            content: translatePrompt,
          },
        ];

        const finalRetryContent = await runModel(usedModel, finalRetryMessages, translateSystemPrompt);
        finalNarration = finalRetryContent || finalNarration;
      }
    }

    finalNarration = trimToWordLimit(finalNarration, maxWords, isListenMode);

    return NextResponse.json({
      narration: finalNarration,
      modelUsed: usedModel,
    });
  } catch (err) {
    console.error("AI API error:", err);
    return NextResponse.json(
      { error: "AI generation failed" },
      { status: 500 }
    );
  }
}
