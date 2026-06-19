import Groq from "groq-sdk";
import type { ChatMessage } from "./types";

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
  const systemPrompt = `You are a helpful document assistant. The user has uploaded a document and wants to ask questions about it.

Document: "${documentContext.fileName}"
Source language: ${documentContext.detectedLanguage}

--- ORIGINAL EXTRACTED TEXT ---
${documentContext.originalText.slice(0, 12000)}

--- ENGLISH TRANSLATION ---
${documentContext.englishText.slice(0, 12000)}

Instructions:
- Answer questions based ONLY on the document content above
- Be precise and cite relevant parts when helpful
- If the answer is not in the document, say so clearly
- Keep answers concise but complete
- You may reference both the original and English versions when relevant`;

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
