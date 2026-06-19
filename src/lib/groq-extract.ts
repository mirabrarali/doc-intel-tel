import Groq from "groq-sdk";
import type { ExtractionResult } from "./gemini";
import { chunkText, mergeExtractedParts } from "./chunk";
import { GROQ_TELUGU_EXTRACT_PROMPT, TRANSLATE_PROMPT } from "./prompts";

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY || "" });

const MODEL = "llama-3.3-70b-versatile";

function parseExtractionJson(raw: string): ExtractionResult {
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("Failed to parse extraction response");
  try {
    const parsed = JSON.parse(jsonMatch[0]) as ExtractionResult;
    if (!parsed.originalText || !parsed.englishText) {
      throw new Error("Incomplete extraction result");
    }
    return parsed;
  } catch {
    throw new Error("Model returned invalid JSON. Try a smaller document.");
  }
}

async function groqJsonCall(system: string, user: string): Promise<string> {
  const completion = await groq.chat.completions.create({
    model: MODEL,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    temperature: 0.1,
    max_tokens: 8192,
    response_format: { type: "json_object" },
  });

  const content = completion.choices[0]?.message?.content;
  if (!content) throw new Error("No extraction result returned");
  return content;
}

export async function extractAndTranslateWithGroq(
  documentText: string
): Promise<ExtractionResult> {
  if (!process.env.GROQ_API_KEY) {
    throw new Error("Document processing unavailable. Configure API keys in Vercel.");
  }

  const chunks = chunkText(documentText, 12000);

  if (chunks.length === 1) {
    const content = await groqJsonCall(
      GROQ_TELUGU_EXTRACT_PROMPT,
      `Document content:\n\n${documentText}`
    );
    return parseExtractionJson(content);
  }

  // Two-pass for long Telugu documents
  const originalParts: string[] = [];
  let detectedLanguage = "Telugu";

  for (const chunk of chunks) {
    const content = await groqJsonCall(
      `Extract text exactly as written. Do NOT translate. Return JSON: { "originalText": "...", "detectedLanguage": "Telugu" }`,
      `Extract from:\n\n${chunk}`
    );
    const parsed = JSON.parse(content.match(/\{[\s\S]*\}/)![0]) as {
      originalText: string;
      detectedLanguage?: string;
    };
    originalParts.push(parsed.originalText);
    if (parsed.detectedLanguage) detectedLanguage = parsed.detectedLanguage;
  }

  const originalText = mergeExtractedParts(originalParts);
  const translatedParts: string[] = [];

  for (const chunk of chunkText(originalText, 8000)) {
    const content = await groqJsonCall(
      TRANSLATE_PROMPT(detectedLanguage),
      `Translate:\n\n${chunk}`
    );
    const parsed = JSON.parse(content.match(/\{[\s\S]*\}/)![0]) as {
      englishText: string;
    };
    translatedParts.push(parsed.englishText);
  }

  return {
    originalText,
    englishText: mergeExtractedParts(translatedParts),
    detectedLanguage,
    confidence: 0.8,
  };
}
