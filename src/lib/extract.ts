import "server-only";
import mammoth from "mammoth";
import { extractText, getDocumentProxy } from "unpdf";

export const MAX_TEXT = 60_000;

/** Plain text from a PDF, DOCX, or TXT upload. Scanned PDFs (images only) come back empty. */
export async function fileToText(file: File): Promise<string> {
  const name = file.name.toLowerCase();
  if (name.endsWith(".pdf")) {
    const pdf = await getDocumentProxy(new Uint8Array(await file.arrayBuffer()));
    return (await extractText(pdf, { mergePages: true })).text.trim();
  }
  if (name.endsWith(".docx")) {
    const { value } = await mammoth.extractRawText({ buffer: Buffer.from(await file.arrayBuffer()) });
    return value.trim();
  }
  return (await file.text()).trim();
}
