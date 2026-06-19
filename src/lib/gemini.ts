import { GoogleGenerativeAI } from "@google/generative-ai";
import type { ExtractionProof } from "./types";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");

const MODEL_FALLBACKS = (
  process.env.GEMINI_MODEL ||
  "gemini-2.5-flash,gemini-1.5-flash,gemini-2.5-flash-lite"
).split(",").map((m) => m.trim());

export interface ExtractionResult {
  originalText: string;
  englishText: string;
  detectedLanguage: string;
  confidence: number;
}

function getMimeType(fileName: string): string {
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

function parseRetrySeconds(message: string): number {
  const match = message.match(/retry in (\d+(?:\.\d+)?)s/i);
  return match ? Math.ceil(parseFloat(match[1])) + 1 : 5;
}

function isQuotaError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return (
    msg.includes("429") ||
    msg.includes("quota") ||
    msg.includes("Too Many Requests") ||
    msg.includes("limit: 0")
  );
}

function parseExtractionJson(raw: string): ExtractionResult {
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error("Failed to parse extraction response");
  }

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

const EXTRACTION_PROMPT = `You are a document intelligence system. Analyze this document carefully.

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
- Preserve meaning, numbers, dates, and names accurately
- Escape special characters properly inside JSON strings`;

type ContentParts = Parameters<
  ReturnType<GoogleGenerativeAI["getGenerativeModel"]>["generateContent"]
>[0];

async function generateWithModel(modelName: string, parts: ContentParts) {
  const model = genAI.getGenerativeModel({
    model: modelName,
    generationConfig: {
      responseMimeType: "application/json",
      temperature: 0.1,
    },
  });
  return model.generateContent(parts);
}

async function generateWithFallback(parts: ContentParts) {
  let lastError: unknown;

  for (const modelName of MODEL_FALLBACKS) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        return await generateWithModel(modelName, parts);
      } catch (err) {
        lastError = err;
        if (isQuotaError(err) && attempt === 0) {
          const wait = parseRetrySeconds(
            err instanceof Error ? err.message : String(err)
          );
          await new Promise((r) => setTimeout(r, wait * 1000));
          continue;
        }
        break;
      }
    }
  }

  throw lastError;
}

export async function extractAndTranslate(
  buffer: Buffer,
  fileName: string,
  fileType: string
): Promise<{ result: ExtractionResult; processingTimeMs: number }> {
  const start = Date.now();

  const mimeType = getMimeType(fileName);
  const isTextFile = mimeType === "text/plain" || fileType.startsWith("text/");

  const parts: ContentParts = isTextFile
    ? [EXTRACTION_PROMPT, `\n\nDocument content:\n${buffer.toString("utf-8")}`]
    : [
        EXTRACTION_PROMPT,
        {
          inlineData: {
            mimeType,
            data: buffer.toString("base64"),
          },
        },
      ];

  let response;
  try {
    response = await generateWithFallback(parts);
  } catch (err) {
    if (isQuotaError(err)) {
      throw new Error("GEMINI_QUOTA_EXCEEDED");
    }
    throw err;
  }

  const raw = response.response.text();
  const parsed = parseExtractionJson(raw);
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

export function isImageOrPdf(fileName: string, fileType: string): boolean {
  const mimeType = getMimeType(fileName);
  return (
    mimeType === "application/pdf" ||
    mimeType.startsWith("image/") ||
    fileType.startsWith("image/") ||
    fileType === "application/pdf"
  );
}
