/**
 * Text with positions from Bandai's PDFs (comprehensive rules, FAQ tables), via unpdf.
 * Parsers work on these plain items so they can be tested without a PDF.
 */
import { getDocumentProxy } from "unpdf";

/** One run of text: x/y of its baseline start in PDF points (y grows upward), and its width. */
export type PdfItem = { x: number; y: number; w: number; str: string };
export type PdfPage = PdfItem[];

export async function pdfPages(bytes: Uint8Array): Promise<PdfPage[]> {
  const pdf = await getDocumentProxy(bytes);
  const pages: PdfPage[] = [];
  for (let n = 1; n <= pdf.numPages; n++) {
    const content = await (await pdf.getPage(n)).getTextContent();
    const items: PdfItem[] = [];
    for (const it of content.items) {
      if (!("str" in it) || !it.str.trim()) continue;
      items.push({ x: it.transform[4] as number, y: it.transform[5] as number, w: it.width, str: it.str });
    }
    pages.push(items);
  }
  await pdf.loadingTask.destroy();
  return pages;
}

/** Joins runs left to right, adding a space only where the runs don't touch. */
export function joinRuns(items: readonly PdfItem[]): string {
  const sorted = [...items].sort((a, b) => a.x - b.x);
  let out = "";
  let end = -Infinity;
  for (const it of sorted) {
    if (out && it.x - end > 1.5 && !out.endsWith(" ") && !it.str.startsWith(" ")) out += " ";
    out += it.str;
    end = it.x + it.w;
  }
  return out.replace(/\s+/g, " ").trim();
}

/** Lines of a page, top to bottom: runs whose baselines are within 2pt are one line. */
export function pageLines(items: readonly PdfItem[]): string[] {
  const rows: { y: number; items: PdfItem[] }[] = [];
  for (const it of [...items].sort((a, b) => b.y - a.y)) {
    const row = rows.find((r) => Math.abs(r.y - it.y) <= 2);
    if (row) row.items.push(it);
    else rows.push({ y: it.y, items: [it] });
  }
  return rows.sort((a, b) => b.y - a.y).map((r) => joinRuns(r.items)).filter(Boolean);
}
