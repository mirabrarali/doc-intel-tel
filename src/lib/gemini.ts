import { GoogleGenerativeAI } from "@google/generative-ai";
import type { ExtractionProof } from "./types";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");

const MODEL = "gemini-2.0-flash";

export interface ExtractionResult {
  originalText: string;
  englishText: string;
  detectedLanguage: string;
  confidence: number;
}

function getMimeType(fileName: string, buffer: Buffer): string {
  const ext = fileName.split(".").pop()?.toLowerCase() || "";
  const mimeMap: Record<string, string> = {
    pdf: "application/pdf",
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    webp: "image/webp",
    gif: "image/gif",
    txt: "text/plain",
    md: "text/plain",
    csv: "text/plain",
  };
  return mimeMap[ext] || "application/octet-stream";
}

export async function extractAndTranslate(
  buffer: Buffer,
  fileName: string,
  fileType: string
): Promise<{ result: ExtractionResult; processingTimeMs: number }> {
  const start = Date.now();
  const model = genAI.getGenerativeModel({ model: MODEL });

  const prompt = `You are a document intelligence system. Analyze this document carefully.

TASK:
1. Extract ALL text content from the document exactly as written, preserving structure (paragraphs, lists, tables as readable text).
2. Detect the source language of the document.
3. Translate the full extracted text into clear, accurate English.

Respond ONLY with valid JSON in this exact format (no markdown, no code fences):
{
  "originalText": "full extracted text in original language",
  "englishText": "full translated text in English",
  "detectedLanguage": "language name in English e.g. Telugu, Hindi, Arabic",
  "confidence": 0.95
}

Rules:
- confidence is a number between 0 and 1 representing extraction quality
- If the document is already in English, originalText and englishText can be the same
- Do not summarize — extract and translate the complete content
- Preserve meaning, numbers, dates, and names accurately`;

  const mimeType = getMimeType(fileName, buffer);
  const isTextFile = mimeType === "text/plain" || fileType.startsWith("text/");

  let response;

  if (isTextFile) {
    const textContent = buffer.toString("utf-8");
    response = await model.generateContent([
      prompt,
      `\n\nDocument content:\n${textContent}`,
    ]);
  } else {
    response = await model.generateContent([
      prompt,
      {
        inlineData: {
          mimeType,
          data: buffer.toString("base64"),
        },
      },
    ]);
  }

  const raw = response.response.text();
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error("Failed to parse Gemini extraction response");
  }

  const parsed = JSON.parse(jsonMatch[0]) as ExtractionResult;
  const processingTimeMs = Date.now() - start;

  return { result: parsed, processingTimeMs };
}

export function buildProof(
  fileName: string,
  fileType: string,
  fileSizeBytes: number,
  result: ExtractionResult,
  processingTimeMs: number
): ExtractionProof {
  const text = result.originalText || "";
  return {
    detectedLanguage: result.detectedLanguage,
    confidence: result.confidence,
    wordCount: text.split(/\s+/).filter(Boolean).length,
    characterCount: text.length,
    processingTimeMs,
    fileType,
    fileName,
    fileSizeBytes,
    extractedAt: new Date().toISOString(),
  };
}
