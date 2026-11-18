import { decodeHTML } from "entities";

export const decodeEntities = (text: string): string => decodeHTML(text).replace(/\u00a0/g, " ");

export function plain(html: string, tagGap = ""): string {
  return decodeEntities(html.replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, tagGap))
    .replace(/[ \t]+/g, " ")
    .replace(/\s*\n\s*/g, "\n")
    .trim();
}
