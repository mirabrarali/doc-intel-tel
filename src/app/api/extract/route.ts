import { NextRequest, NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import {
  extractAndTranslate,
  buildProof,
  isImageOrPdf,
} from "@/lib/gemini";
import { extractDocxText } from "@/lib/docx";
import { extractPdfText } from "@/lib/pdf";
import { extractAndTranslateWithGroq } from "@/lib/groq-extract";
import type { ExtractResponse, ErrorResponse } from "@/lib/types";

export const maxDuration = 60;
export const runtime = "nodejs";

const MAX_FILE_SIZE = 4 * 1024 * 1024; // 4MB — Vercel request limit safe

async function getPlainText(
  buffer: Buffer,
  fileName: string,
  fileType: string
): Promise<string | null> {
  const lower = fileName.toLowerCase();

  if (fileType.startsWith("text/") || lower.endsWith(".txt") || lower.endsWith(".md") || lower.endsWith(".csv")) {
    return buffer.toString("utf-8");
  }

  if (
    fileType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
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
        { success: false, error: "No API keys configured. Add GEMINI_API_KEY or GROQ_API_KEY in Vercel." },
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

    // Primary: Gemini (supports images + PDF multimodal)
    if (hasGemini) {
      try {
        let geminiBuffer = buffer;
        let geminiName = fileName;
        let geminiType = fileType;

        if (fileName.toLowerCase().endsWith(".docx")) {
          const text = await extractDocxText(buffer);
          geminiBuffer = Buffer.from(text, "utf-8");
          geminiName = fileName.replace(/\.docx$/i, ".txt");
          geminiType = "text/plain";
        }

        const extraction = await extractAndTranslate(geminiBuffer, geminiName, geminiType);
        result = extraction.result;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        const quotaHit = msg === "GEMINI_QUOTA_EXCEEDED" || msg.includes("quota");

        if (!quotaHit && !msg.includes("invalid JSON")) {
          console.error("Gemini extract error:", err);
        }

        // Fallback: Groq with locally extracted text
        if (hasGroq) {
          const plainText = await getPlainText(buffer, fileName, fileType);
          if (plainText) {
            result = await extractAndTranslateWithGroq(plainText);
            usedFallback = true;
          } else if (quotaHit) {
            return NextResponse.json<ErrorResponse>(
              {
                success: false,
                error: "Processing quota reached for images. Try a PDF with selectable text, DOCX, or TXT file.",
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
              error: "Processing quota reached. Wait a minute and try again, or add GROQ_API_KEY as fallback.",
            },
            { status: 429 }
          );
        } else {
          throw err;
        }
      }
    } else {
      // Groq-only mode
      const plainText = await getPlainText(buffer, fileName, fileType);
      if (!plainText && isImageOrPdf(fileName, fileType)) {
        return NextResponse.json<ErrorResponse>(
          {
            success: false,
            error: "Image processing requires GEMINI_API_KEY. Text-based files work with GROQ_API_KEY only.",
          },
          { status: 400 }
        );
      }
      if (!plainText) {
        return NextResponse.json<ErrorResponse>(
          { success: false, error: "Unsupported file type." },
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
      proof.confidence = Math.min(proof.confidence, 0.85);
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
