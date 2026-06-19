import { NextRequest, NextResponse } from "next/server";
import { v4 as uuidv4 } from "uuid";
import { extractAndTranslate, buildProof } from "@/lib/gemini";
import { extractDocxText } from "@/lib/docx";
import type { ExtractResponse, ErrorResponse } from "@/lib/types";

export const maxDuration = 60;

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

export async function POST(req: NextRequest) {
  try {
    if (!process.env.GEMINI_API_KEY) {
      return NextResponse.json<ErrorResponse>(
        { success: false, error: "GEMINI_API_KEY is not configured" },
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
        { success: false, error: "File too large. Maximum size is 10MB." },
        { status: 400 }
      );
    }

    const arrayBuffer = await file.arrayBuffer();
    let buffer = Buffer.from(arrayBuffer);
    let fileName = file.name;
    let fileType = file.type;

    // Convert DOCX to plain text for processing
    if (
      file.type ===
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
      fileName.endsWith(".docx")
    ) {
      const text = await extractDocxText(buffer);
      buffer = Buffer.from(text, "utf-8");
      fileName = fileName.replace(/\.docx$/i, ".txt");
      fileType = "text/plain";
    }

    const { result, processingTimeMs } = await extractAndTranslate(
      buffer,
      fileName,
      fileType
    );

    const proof = buildProof(
      file.name,
      file.type || fileType,
      file.size,
      result,
      processingTimeMs
    );

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
