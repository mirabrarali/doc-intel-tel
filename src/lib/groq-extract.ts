import Groq from "groq-sdk";
import type { ExtractionResult } from "./gemini";

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY || "" });

const MODEL = "llama-3.3-70b-versatile";

const EXTRACTION_PROMPT = `You are a document intelligence system.

Extract ALL text from the document content below, detect its language, and translate to English.

Respond ONLY with valid JSON (no markdown):
{
  "originalText": "full extracted text in original language",
  "englishText": "full translated text in English",
  "detectedLanguage": "language name in English",
  "confidence": 0.95
}`;

function parseExtractionJson(raw: string): ExtractionResult {
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error("Failed to parse extraction response");
  }

  try {
    return JSON.parse(jsonMatch[0]) as ExtractionResult;
  } catch {
    throw new Error("Model returned invalid JSON. Try a smaller document.");
  }
}

export async function extractAndTranslateWithGroq(
  documentText: string
): Promise<ExtractionResult> {
  if (!process.env.GROQ_API_KEY) {
    throw new Error("Document processing unavailable. Configure API keys in Vercel.");
  }

  const completion = await groq.chat.completions.create({
    model: MODEL,
    messages: [
      { role: "system", content: EXTRACTION_PROMPT },
      {
        role: "user",
        content: `Document content:\n\n${documentText.slice(0, 30000)}`,
      },
    ],
    temperature: 0.1,
    max_tokens: 8192,
    response_format: { type: "json_object" },
  });

  const content = completion.choices[0]?.message?.content;
  if (!content) {
    throw new Error("No extraction result returned");
  }

  return parseExtractionJson(content);
}
