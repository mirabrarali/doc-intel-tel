import Groq from "groq-sdk";
import type { ChatMessage } from "./types";
import { CHAT_TELUGU_CONTEXT_NOTE } from "./prompts";
import { containsTeluguScript } from "./chunk";

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY || "" });

const MODEL = "llama-3.3-70b-versatile";

export async function chatWithDocument(
  messages: ChatMessage[],
  documentContext: {
    fileName: string;
    englishText: string;
    originalText: string;
    detectedLanguage: string;
  }
): Promise<string> {
  const isTelugu = containsTeluguScript(documentContext.originalText);

  const systemPrompt = `You are a helpful document assistant. The user has uploaded a document and wants to ask questions about it.

Document: "${documentContext.fileName}"
Source language: ${documentContext.detectedLanguage}
${isTelugu ? CHAT_TELUGU_CONTEXT_NOTE : ""}

--- ORIGINAL EXTRACTED TEXT ---
${documentContext.originalText.slice(0, 14000)}

--- ENGLISH TRANSLATION ---
${documentContext.englishText.slice(0, 14000)}

Instructions:
- Answer questions based ONLY on the document content above
- For Telugu documents: cross-reference original Telugu text with English translation for accuracy
- Be precise and cite relevant parts when helpful
- If the answer is not in the document, say so clearly
- Keep answers concise but complete
- Preserve names, numbers, and dates exactly as in the document`;

  const completion = await groq.chat.completions.create({
    model: MODEL,
    messages: [
      { role: "system", content: systemPrompt },
      ...messages.map((m) => ({ role: m.role, content: m.content })),
    ],
    temperature: 0.3,
    max_tokens: 2048,
  });

  return completion.choices[0]?.message?.content || "No response generated.";
}
