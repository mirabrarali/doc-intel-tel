"use client";

import { useCallback, useState } from "react";
import {
  Upload,
  FileText,
  Loader2,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";
import type { DocumentData } from "@/lib/types";
import { parseApiResponse } from "@/lib/fetch-api";

interface DocumentUploadProps {
  onComplete: (doc: DocumentData) => void;
  isProcessing: boolean;
  setIsProcessing: (v: boolean) => void;
}

const ACCEPT =
  ".pdf,.png,.jpg,.jpeg,.webp,.gif,.txt,.md,.csv,.docx,application/pdf,image/*,text/*";

export default function DocumentUpload({
  onComplete,
  isProcessing,
  setIsProcessing,
}: DocumentUploadProps) {
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const processFile = useCallback(
    async (file: File) => {
      setError(null);
      setIsProcessing(true);

      try {
        const formData = new FormData();
        formData.append("file", file);

        const res = await fetch("/api/extract", {
          method: "POST",
          body: formData,
        });

        const data = await parseApiResponse<{
          success: boolean;
          error?: string;
          document?: DocumentData;
        }>(res);

        if (!res.ok || !data.success) {
          throw new Error(data.error || "Extraction failed");
        }

        if (!data.document) {
          throw new Error("No document returned from server");
        }

        onComplete(data.document);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Upload failed");
      } finally {
        setIsProcessing(false);
      }
    },
    [onComplete, setIsProcessing]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const file = e.dataTransfer.files[0];
      if (file) processFile(file);
    },
    [processFile]
  );

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
  };

  return (
    <div className="space-y-4">
      <label
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        className={`group relative flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed px-6 py-16 transition-all ${
          dragOver
            ? "border-indigo-500 bg-indigo-50 dark:bg-indigo-950/30"
            : "border-zinc-300 bg-zinc-50 hover:border-indigo-400 hover:bg-indigo-50/50 dark:border-zinc-700 dark:bg-zinc-900/50 dark:hover:border-indigo-600 dark:hover:bg-indigo-950/20"
        } ${isProcessing ? "pointer-events-none opacity-60" : ""}`}
      >
        <input
          type="file"
          accept={ACCEPT}
          onChange={handleChange}
          className="absolute inset-0 cursor-pointer opacity-0"
          disabled={isProcessing}
        />

        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-100 text-indigo-600 transition-transform group-hover:scale-105 dark:bg-indigo-950 dark:text-indigo-400">
          {isProcessing ? (
            <Loader2 className="h-7 w-7 animate-spin" />
          ) : (
            <Upload className="h-7 w-7" />
          )}
        </div>

        <p className="mt-4 text-lg font-medium">
          {isProcessing ? "Extracting & translating..." : "Drop your document here"}
        </p>
        <p className="mt-1 text-sm text-zinc-500">
          PDF, images, DOCX, TXT — any language → English
        </p>
        <p className="mt-3 flex items-center gap-1.5 text-xs text-zinc-400">
          <FileText className="h-3.5 w-3.5" />
          Max 4MB
        </p>
      </label>

      {error && (
        <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/50 dark:text-red-400">
          <AlertCircle className="h-4 w-4 shrink-0" />
          {error}
        </div>
      )}

      {isProcessing && (
        <div className="flex items-center gap-2 rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-3 text-sm text-indigo-700 dark:border-indigo-900 dark:bg-indigo-950/50 dark:text-indigo-300">
          <Loader2 className="h-4 w-4 animate-spin" />
          Reading your document and translating to English...
        </div>
      )}
    </div>
  );
}

export function SuccessBanner({ fileName }: { fileName: string }) {
  return (
    <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/50 dark:text-emerald-400">
      <CheckCircle2 className="h-4 w-4 shrink-0" />
      Successfully extracted & translated <strong className="mx-1">{fileName}</strong>
    </div>
  );
}
