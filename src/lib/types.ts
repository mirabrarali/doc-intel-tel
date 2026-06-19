export interface ExtractionProof {
  detectedLanguage: string;
  confidence: number;
  wordCount: number;
  characterCount: number;
  processingTimeMs: number;
  fileType: string;
  fileName: string;
  fileSizeBytes: number;
  extractedAt: string;
}

export interface DocumentData {
  id: string;
  fileName: string;
  originalText: string;
  englishText: string;
  proof: ExtractionProof;
}

export interface ExtractResponse {
  success: true;
  document: DocumentData;
}

export interface ErrorResponse {
  success: false;
  error: string;
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface ChatRequest {
  messages: ChatMessage[];
  documentContext: {
    fileName: string;
    englishText: string;
    originalText: string;
    detectedLanguage: string;
  };
}
