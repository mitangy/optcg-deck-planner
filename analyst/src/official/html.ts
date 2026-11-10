/** Shared HTML-to-text helpers for the Bandai pages the official library scrapes. */
import { decodeHTML } from "entities";

/** Decodes every HTML entity (named, decimal, hex); a non-breaking space becomes a plain space. */
export const decodeEntities = (text: string): string => decodeHTML(text).replace(/\u00a0/g, " ");

/**
 * HTML to text: `<br>` becomes a newline, other tags are dropped (replaced by `tagGap`), then entities are decoded.
 * Tags go first so an escaped `&lt;b&gt;` stays literal text. Spaces collapse; newlines are kept and tidied.
 */
export function plain(html: string, tagGap = ""): string {
  return decodeEntities(html.replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, tagGap))
    .replace(/[ \t]+/g, " ")
    .replace(/\s*\n\s*/g, "\n")
    .trim();
}
