export function chunkText(text: string, maxSize = 10000): string[] {
  if (text.length <= maxSize) return [text];

  const chunks: string[] = [];
  const paragraphs = text.split(/\n{2,}/);
  let current = "";

  for (const para of paragraphs) {
    if ((current + "\n\n" + para).length > maxSize && current) {
      chunks.push(current.trim());
      current = para;
    } else {
      current = current ? `${current}\n\n${para}` : para;
    }
  }

  if (current.trim()) chunks.push(current.trim());

  // Split oversized single paragraphs
  const final: string[] = [];
  for (const chunk of chunks) {
    if (chunk.length <= maxSize) {
      final.push(chunk);
    } else {
      for (let i = 0; i < chunk.length; i += maxSize) {
        final.push(chunk.slice(i, i + maxSize));
      }
    }
  }

  return final;
}

export function mergeExtractedParts(parts: string[]): string {
  return parts.filter(Boolean).join("\n\n");
}

export function containsTeluguScript(text: string): boolean {
  return /[\u0C00-\u0C7F]/.test(text);
}

export function isLikelyBrokenPdfText(text: string): boolean {
  if (!text || text.trim().length < 30) return true;
  const replacement = (text.match(/[\uFFFD�]/g) || []).length;
  if (replacement > 5) return true;
  // PDF text layer missing — mostly whitespace or control chars
  const printable = text.replace(/\s/g, "").length;
  if (printable < 20) return true;
  return false;
}
