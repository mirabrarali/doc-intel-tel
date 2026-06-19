import { GoogleGenerativeAI } from "@google/generative-ai";
import type { ExtractionProof } from "./types";
import { chunkText, mergeExtractedParts, containsTeluguScript } from "./chunk";
import { EXTRACT_ONLY_PROMPT, TRANSLATE_PROMPT } from "./prompts";

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

type ContentParts = Parameters<
  ReturnType<GoogleGenerativeAI["getGenerativeModel"]>["generateContent"]
>[0];

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

function parseJsonField<T>(raw: string, field: keyof T): T {
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("Failed to parse model response");
  try {
    return JSON.parse(jsonMatch[0]) as T;
  } catch {
    throw new Error("Model returned invalid JSON. Try a smaller document.");
  }
}

async function generateWithModel(modelName: string, parts: ContentParts) {
  const model = genAI.getGenerativeModel({
    model: modelName,
    generationConfig: {
      responseMimeType: "application/json",
      temperature: 0.05,
      maxOutputTokens: 8192,
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

function buildContentParts(
  buffer: Buffer,
  fileName: string,
  fileType: string,
  prompt: string,
  extraText?: string
): ContentParts {
  const mimeType = getMimeType(fileName);
  const isTextFile = mimeType === "text/plain" || fileType.startsWith("text/");

  if (extraText) {
    return [prompt, `\n\nDocument text:\n${extraText}`];
  }

  if (isTextFile) {
    return [prompt, `\n\nDocument content:\n${buffer.toString("utf-8")}`];
  }

  return [
    prompt,
    {
      inlineData: {
        mimeType,
        data: buffer.toString("base64"),
      },
    },
  ];
}

async function extractOriginalText(
  buffer: Buffer,
  fileName: string,
  fileType: string,
  plainText?: string
): Promise<{ originalText: string; detectedLanguage: string; confidence: number }> {
  const parts = buildContentParts(
    buffer,
    fileName,
    fileType,
    EXTRACT_ONLY_PROMPT,
    plainText
  );

  let response;
  try {
    response = await generateWithFallback(parts);
  } catch (err) {
    if (isQuotaError(err)) throw new Error("GEMINI_QUOTA_EXCEEDED");
    throw err;
  }

  const parsed = parseJsonField<{
    originalText: string;
    detectedLanguage: string;
    confidence: number;
  }>(response.response.text(), "originalText");

  if (!parsed.originalText?.trim()) {
    throw new Error("No text could be extracted from this document.");
  }

  return parsed;
}

async function translateChunk(
  text: string,
  language: string
): Promise<string> {
  const parts: ContentParts = [
    TRANSLATE_PROMPT(language),
    `\n\nText to translate:\n${text}`,
  ];

  let response;
  try {
    response = await generateWithFallback(parts);
  } catch (err) {
    if (isQuotaError(err)) throw new Error("GEMINI_QUOTA_EXCEEDED");
    throw err;
  }

  const parsed = parseJsonField<{ englishText: string }>(
    response.response.text(),
    "englishText"
  );

  return parsed.englishText || "";
}

async function translateToEnglish(
  originalText: string,
  detectedLanguage: string
): Promise<string> {
  const isEnglish =
    detectedLanguage.toLowerCase().includes("english") &&
    !containsTeluguScript(originalText);

  if (isEnglish) return originalText;

  const chunks = chunkText(originalText, 8000);
  const translated: string[] = [];

  for (const chunk of chunks) {
    const part = await translateChunk(chunk, detectedLanguage);
    translated.push(part);
  }

  return mergeExtractedParts(translated);
}

export async function extractAndTranslate(
  buffer: Buffer,
  fileName: string,
  fileType: string,
  plainText?: string
): Promise<{ result: ExtractionResult; processingTimeMs: number }> {
  const start = Date.now();

  const { originalText, detectedLanguage, confidence } =
    await extractOriginalText(buffer, fileName, fileType, plainText);

  const englishText = await translateToEnglish(originalText, detectedLanguage);

  const processingTimeMs = Date.now() - start;

  return {
    result: {
      originalText,
      englishText,
      detectedLanguage,
      confidence,
    },
    processingTimeMs,
  };
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

export function isMultimodalFile(fileName: string, fileType: string): boolean {
  return isImageOrPdf(fileName, fileType);
}
