"use client";

import { useState } from "react";
import Link from "next/link";
import { MessageSquare, ArrowRight } from "lucide-react";
import DocumentUpload, { SuccessBanner } from "@/components/DocumentUpload";
import ExtractionProofPanel, { TextPanel } from "@/components/ExtractionResults";
import { saveDocument } from "@/lib/document-storage";
import type { DocumentData } from "@/lib/types";

export default function HomePage() {
  const [document, setDocument] = useState<DocumentData | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  const handleComplete = (doc: DocumentData) => {
    setDocument(doc);
    saveDocument(doc);
  };

  return (
    <main className="mx-auto max-w-6xl flex-1 px-4 py-8">
      {/* Hero */}
      <div className="mb-8 text-center">
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
          Document Intelligence
        </h1>
        <p className="mx-auto mt-2 max-w-xl text-zinc-500">
          Upload any document in any language. Instantly extract text and translate to
          English with verified proof — then chat with your document.
        </p>
      </div>

      {/* Upload */}
      {!document && (
        <DocumentUpload
          onComplete={handleComplete}
          isProcessing={isProcessing}
          setIsProcessing={setIsProcessing}
        />
      )}

      {/* Results */}
      {document && (
        <div className="space-y-8">
          <SuccessBanner fileName={document.fileName} />

          <ExtractionProofPanel proof={document.proof} />

          <div className="grid gap-6 lg:grid-cols-2">
            <TextPanel
              title="Extracted Text"
              subtitle={`Original · ${document.proof.detectedLanguage}`}
              text={document.originalText}
              accent="original"
            />
            <TextPanel
              title="English Translation"
              subtitle="Translated by Gemini"
              text={document.englishText}
              accent="english"
            />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-indigo-200 bg-indigo-50 p-5 dark:border-indigo-900 dark:bg-indigo-950/30">
            <div>
              <p className="font-semibold text-indigo-900 dark:text-indigo-200">
                Ready to chat with this document?
              </p>
              <p className="text-sm text-indigo-700/80 dark:text-indigo-400/80">
                Ask questions, get summaries, and explore content conversationally.
              </p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => {
                  setDocument(null);
                }}
                className="rounded-xl border border-zinc-300 px-4 py-2 text-sm font-medium transition hover:bg-white dark:border-zinc-700 dark:hover:bg-zinc-800"
              >
                Upload Another
              </button>
              <Link
                href="/chat"
                className="flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2 text-sm font-medium text-white transition hover:bg-indigo-700"
              >
                <MessageSquare className="h-4 w-4" />
                Chat with Document
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
