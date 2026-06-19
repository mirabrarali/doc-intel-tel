import type { DocumentData } from "./types";

const STORAGE_KEY = "doc-intel-document";

export function saveDocument(doc: DocumentData): void {
  if (typeof window === "undefined") return;
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(doc));
}

export function loadDocument(): DocumentData | null {
  if (typeof window === "undefined") return null;
  const raw = sessionStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as DocumentData;
  } catch {
    return null;
  }
}

export function clearDocument(): void {
  if (typeof window === "undefined") return;
  sessionStorage.removeItem(STORAGE_KEY);
}
