"use client";

import {
  Globe,
  Clock,
  FileType,
  Hash,
  Gauge,
  Calendar,
  HardDrive,
} from "lucide-react";
import type { ExtractionProof } from "@/lib/types";

function ProofItem({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-indigo-100 text-indigo-600 dark:bg-indigo-950 dark:text-indigo-400">
        <Icon className="h-4 w-4" />
      </div>
      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">
          {label}
        </p>
        <p className="mt-0.5 text-sm font-semibold">{value}</p>
      </div>
    </div>
  );
}

export default function ExtractionProofPanel({ proof }: { proof: ExtractionProof }) {
  const confidencePct = Math.round(proof.confidence * 100);
  const sizeKb = (proof.fileSizeBytes / 1024).toFixed(1);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Proof of Extraction</h2>
        <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-medium text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400">
          Verified
        </span>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <ProofItem icon={Globe} label="Detected Language" value={proof.detectedLanguage} />
        <ProofItem icon={Gauge} label="Confidence" value={`${confidencePct}%`} />
        <ProofItem icon={Hash} label="Word Count" value={proof.wordCount.toLocaleString()} />
        <ProofItem icon={Clock} label="Processing Time" value={`${proof.processingTimeMs}ms`} />
        <ProofItem icon={FileType} label="File Type" value={proof.fileType || "unknown"} />
        <ProofItem icon={HardDrive} label="File Size" value={`${sizeKb} KB`} />
        <ProofItem
          icon={Calendar}
          label="Extracted At"
          value={new Date(proof.extractedAt).toLocaleString()}
        />
        <ProofItem icon={Hash} label="Characters" value={proof.characterCount.toLocaleString()} />
      </div>

      {/* Confidence bar */}
      <div className="rounded-xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
        <div className="mb-2 flex justify-between text-sm">
          <span className="font-medium">Extraction Quality</span>
          <span className="text-zinc-500">{confidencePct}%</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
          <div
            className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-emerald-500 transition-all duration-700"
            style={{ width: `${confidencePct}%` }}
          />
        </div>
      </div>
    </div>
  );
}

interface TextPanelProps {
  title: string;
  subtitle: string;
  text: string;
  accent?: "original" | "english";
}

export function TextPanel({ title, subtitle, text, accent = "original" }: TextPanelProps) {
  const borderColor =
    accent === "english"
      ? "border-emerald-200 dark:border-emerald-900"
      : "border-zinc-200 dark:border-zinc-800";

  return (
    <div className={`rounded-2xl border ${borderColor} bg-white dark:bg-zinc-900`}>
      <div className="border-b border-inherit px-5 py-4">
        <h3 className="font-semibold">{title}</h3>
        <p className="text-xs text-zinc-500">{subtitle}</p>
      </div>
      <div className="max-h-[420px] overflow-y-auto px-5 py-4">
        <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-zinc-700 dark:text-zinc-300">
          {text || "No content extracted."}
        </pre>
      </div>
    </div>
  );
}
