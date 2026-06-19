import { PDFParse } from "pdf-parse";

export async function extractPdfText(buffer: Buffer): Promise<string> {
  const parser = new PDFParse({ data: buffer });
  try {
    const result = await parser.getText();
    const text = result.text?.trim();
    if (!text) {
      throw new Error("Could not extract text from PDF. Try an image or text file.");
    }
    return text;
  } finally {
    await parser.destroy();
  }
}
