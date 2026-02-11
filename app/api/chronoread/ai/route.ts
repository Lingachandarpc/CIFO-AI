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
    const { query, category, narrationTime, narrationType, language, interactionMode, continuation } = await req.json();

    const narrativeStyleGuide = {
      "Realistic": "Tell the story in a realistic, factual, and grounded manner with real-world examples.",
      "Dramatic": "Tell the story with dramatic flair, engaging tension, and emotional depth.",
      "Educational": "Tell the story in an educational style, focusing on learning outcomes and key insights."
    };

    const styleInstruction = narrativeStyleGuide[narrationType as keyof typeof narrativeStyleGuide] || narrativeStyleGuide.Realistic;
    const timeDescription = narrationTime <= 2 ? "brief (under 2 minutes)" : narrationTime <= 5 ? "short (2-5 minutes)" : "medium-length (5+ minutes)";

    const isListenMode = interactionMode === 'listen';
    const listenGuidance = `The response MUST be anchored in real-life case studies or books, with practical solutions referencing those sources. Use a natural spoken delivery with light human cues (soft chuckle, gentle pause, subtle emphasis) but do not overdo it.`;
    const listenStructure = `Start with a first line: Genre: <one or two words>. Then narrate. End with "Suggested next: <similar book or case study>".`;
    const languageEnforcement = `You MUST respond only in ${language}. Do not include translations. Do not use English except for proper nouns. For listen mode, keep the tags "Genre:" and "Suggested next:" in English, but everything else must be in ${language}.`;

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
      ? `First, identify up to 5 relevant books or case studies (title + short reason) that match this concern: "${query}". Then provide a ${timeDescription} narrated summary addressing the concern, written in ${language} and the ${narrationType} style. Format: start with a short list of matches, then the narration.\n- ${languageEnforcement}`
      : `Tell a ${timeDescription} engaging narration about:\n"${query}"\nCategory: ${category}\n\nInstructions:\n- Duration: approximately ${narrationTime} minutes\n- Narrative Style: ${narrationType}\n- Language: ${language}\n- ${styleInstruction}\n- Keep the narration engaging, clear, and suitable for audio playback\n- ${languageEnforcement}`;

    const targetWords = Math.max(180, narrationTime * 130);
    const listenPrompt = `${continuationPrompt}Tell a ${timeDescription} narration about:\n"${query}"\nCategory: ${category}\n\nInstructions:\n- Duration: approximately ${narrationTime} minutes (around ${targetWords} words)\n- Narrative Style: ${narrationType}\n- Language: ${language}\n- ${styleInstruction}\n- ${listenGuidance}\n- ${listenStructure}\n- ${languageEnforcement}`;

    const res = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        {
          role: "system",
          content: `You are a great storyteller and narrative expert. You create engaging and personalized narrations. 
Style: ${narrationType}
Language: ${language}
${styleInstruction}
${languageEnforcement}`,
        },
        {
          role: "user",
          content: isListenMode ? listenPrompt : userPrompt,
        },
      ],
    });
    const initialNarration = res.choices[0].message.content || '';

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

    let finalNarration = initialNarration;
    if (needsScriptRetry(initialNarration)) {
      const rewritePrompt = `Rewrite the following narration so it is fully in ${language} using its native script only.\n` +
        `If this is listen mode, keep the tags "Genre:" and "Suggested next:" in English exactly as tags, but translate everything else.\n\n` +
        `Narration to rewrite:\n"""${initialNarration}"""`;

      const retry = await openai.chat.completions.create({
        model: "gpt-3.5-turbo",
        messages: [
          {
            role: "system",
            content: `You strictly follow the requested language and script. ${languageEnforcement}`,
          },
          {
            role: "user",
            content: rewritePrompt,
          },
        ],
      });
      finalNarration = retry.choices[0].message.content || initialNarration;

      if (needsScriptRetry(finalNarration)) {
        const translatePrompt = `Translate the following text into ${language}. Output ONLY ${language} in its native script.\n` +
          `If this is listen mode, keep the tags "Genre:" and "Suggested next:" in English exactly as tags, but translate everything else.\n\n` +
          `Text to translate:\n"""${finalNarration}"""`;

        const finalRetry = await openai.chat.completions.create({
          model: "gpt-3.5-turbo",
          messages: [
            {
              role: "system",
              content: `You output only ${language} in native script. ${languageEnforcement}`,
            },
            {
              role: "user",
              content: translatePrompt,
            },
          ],
        });
        finalNarration = finalRetry.choices[0].message.content || finalNarration;
      }
    }

    return NextResponse.json({
      narration: finalNarration,
    });
  } catch (err) {
    console.error("AI API error:", err);
    return NextResponse.json(
      { error: "AI generation failed" },
      { status: 500 }
    );
  }
}
