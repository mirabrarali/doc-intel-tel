"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Upload } from "lucide-react";
import ChatInterface from "@/components/ChatInterface";
import { loadDocument } from "@/lib/document-storage";
import type { DocumentData } from "@/lib/types";

export default function ChatPage() {
  const [document, setDocument] = useState<DocumentData | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    setDocument(loadDocument());
    setLoaded(true);
  }, []);

  if (!loaded) return null;

  return (
    <main className="mx-auto max-w-4xl flex-1 px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Document Chat</h1>
          <p className="text-sm text-zinc-500">
            Ask questions about your uploaded document
          </p>
        </div>
        {!document && (
          <Link
            href="/"
            className="flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-700"
          >
            <Upload className="h-4 w-4" />
            Upload Document
          </Link>
        )}
      </div>

      <ChatInterface document={document} />
    </main>
  );
}
