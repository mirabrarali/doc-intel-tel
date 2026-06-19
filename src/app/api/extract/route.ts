import { NextRequest, NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import {
  extractAndTranslate,
  buildProof,
  isImageOrPdf,
  isMultimodalFile,
} from "@/lib/gemini";
import { extractDocxText } from "@/lib/docx";
import { extractPdfText } from "@/lib/pdf";
import { extractAndTranslateWithGroq } from "@/lib/groq-extract";
import { isLikelyBrokenPdfText, containsTeluguScript } from "@/lib/chunk";
import type { ExtractResponse, ErrorResponse } from "@/lib/types";

export const maxDuration = 60;
export const runtime = "nodejs";

const MAX_FILE_SIZE = 4 * 1024 * 1024;

async function getPlainText(
  buffer: Buffer,
  fileName: string,
  fileType: string
): Promise<string | null> {
  const lower = fileName.toLowerCase();

  if (
    fileType.startsWith("text/") ||
    lower.endsWith(".txt") ||
    lower.endsWith(".md") ||
    lower.endsWith(".csv")
  ) {
    return buffer.toString("utf-8");
  }

  if (
    fileType ===
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    lower.endsWith(".docx")
  ) {
    return extractDocxText(buffer);
  }

  if (fileType === "application/pdf" || lower.endsWith(".pdf")) {
    return extractPdfText(buffer);
  }

  return null;
}

export async function POST(req: NextRequest) {
  try {
    const hasGemini = Boolean(process.env.GEMINI_API_KEY);
    const hasGroq = Boolean(process.env.GROQ_API_KEY);

    if (!hasGemini && !hasGroq) {
      return NextResponse.json<ErrorResponse>(
        {
          success: false,
          error: "No API keys configured. Add GEMINI_API_KEY or GROQ_API_KEY in Vercel.",
        },
        { status: 500 }
      );
    }

    const formData = await req.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json<ErrorResponse>(
        { success: false, error: "No file uploaded" },
        { status: 400 }
      );
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json<ErrorResponse>(
        { success: false, error: "File too large. Maximum size is 4MB." },
        { status: 400 }
      );
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const fileName = file.name;
    const fileType = file.type;

    const start = Date.now();
    let result;
    let usedFallback = false;

    const isPdfOrImage = isMultimodalFile(fileName, fileType);

    if (hasGemini) {
      try {
        // Always use Gemini multimodal for PDF/image — critical for Telugu OCR
        if (isPdfOrImage) {
          const extraction = await extractAndTranslate(buffer, fileName, fileType);
          result = extraction.result;
        } else {
          let geminiBuffer = buffer;
          let geminiName = fileName;
          let geminiType = fileType;
          let plainText: string | undefined;

          if (fileName.toLowerCase().endsWith(".docx")) {
            plainText = await extractDocxText(buffer);
            geminiBuffer = Buffer.from(plainText, "utf-8");
            geminiName = fileName.replace(/\.docx$/i, ".txt");
            geminiType = "text/plain";
          }

          const extraction = await extractAndTranslate(
            geminiBuffer,
            geminiName,
            geminiType,
            plainText
          );
          result = extraction.result;
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        const quotaHit = msg === "GEMINI_QUOTA_EXCEEDED" || msg.includes("quota");

        if (!quotaHit && !msg.includes("invalid JSON")) {
          console.error("Gemini extract error:", err);
        }

        if (hasGroq && !isPdfOrImage) {
          const plainText = await getPlainText(buffer, fileName, fileType);
          if (plainText && !isLikelyBrokenPdfText(plainText)) {
            result = await extractAndTranslateWithGroq(plainText);
            usedFallback = true;
          } else if (quotaHit && isPdfOrImage) {
            return NextResponse.json<ErrorResponse>(
              {
                success: false,
                error:
                  "Telugu PDF/image documents require active API access for OCR. Wait a minute and retry, or upload as a clear photo/scan.",
              },
              { status: 429 }
            );
          } else {
            throw err;
          }
        } else if (quotaHit) {
          return NextResponse.json<ErrorResponse>(
            {
              success: false,
              error:
                "Processing quota reached. Complex Telugu documents need a moment — wait 60 seconds and retry.",
            },
            { status: 429 }
          );
        } else {
          throw err;
        }
      }
    } else {
      const plainText = await getPlainText(buffer, fileName, fileType);
      if (!plainText && isImageOrPdf(fileName, fileType)) {
        return NextResponse.json<ErrorResponse>(
          {
            success: false,
            error:
              "Telugu PDF/image documents require GEMINI_API_KEY for accurate OCR.",
          },
          { status: 400 }
        );
      }
      if (!plainText || isLikelyBrokenPdfText(plainText)) {
        return NextResponse.json<ErrorResponse>(
          {
            success: false,
            error:
              "Could not read this document. For complex Telugu PDFs, add GEMINI_API_KEY and upload the original PDF or a clear scan.",
          },
          { status: 400 }
        );
      }
      result = await extractAndTranslateWithGroq(plainText);
      usedFallback = true;
    }

    const processingTimeMs = Date.now() - start;
    const proof = buildProof(
      file.name,
      file.type || fileType,
      file.size,
      result,
      processingTimeMs
    );

    if (usedFallback) {
      proof.confidence = Math.min(proof.confidence, 0.8);
    }

    if (containsTeluguScript(result.originalText)) {
      proof.detectedLanguage = proof.detectedLanguage || "Telugu";
    }

    const document = {
      id: uuidv4(),
      fileName: file.name,
      originalText: result.originalText,
      englishText: result.englishText,
      proof,
    };

    return NextResponse.json<ExtractResponse>({ success: true, document });
  } catch (err) {
    console.error("Extract error:", err);
    const message =
      err instanceof Error ? err.message : "Failed to process document";
    return NextResponse.json<ErrorResponse>(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
