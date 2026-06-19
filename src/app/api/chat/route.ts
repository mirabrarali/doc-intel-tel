import { NextRequest, NextResponse } from "next/server";
import { chatWithDocument } from "@/lib/groq";
import type { ChatRequest, ErrorResponse } from "@/lib/types";

export const maxDuration = 30;

export async function POST(req: NextRequest) {
  try {
    if (!process.env.GROQ_API_KEY) {
      return NextResponse.json<ErrorResponse>(
        { success: false, error: "GROQ_API_KEY is not configured" },
        { status: 500 }
      );
    }

    const body = (await req.json()) as ChatRequest;

    if (!body.messages?.length) {
      return NextResponse.json<ErrorResponse>(
        { success: false, error: "No messages provided" },
        { status: 400 }
      );
    }

    if (!body.documentContext?.englishText) {
      return NextResponse.json<ErrorResponse>(
        { success: false, error: "No document context. Upload a document first." },
        { status: 400 }
      );
    }

    const reply = await chatWithDocument(body.messages, body.documentContext);

    return NextResponse.json({ success: true, reply });
  } catch (err) {
    console.error("Chat error:", err);
    const message =
      err instanceof Error ? err.message : "Failed to generate response";
    return NextResponse.json<ErrorResponse>(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
