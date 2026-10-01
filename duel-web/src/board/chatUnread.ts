import type { ChatLine } from "../net/protocol";

/**
 * Lines that arrived after the last one seen (by id). Chat keeps only the
 * last 100 lines, so counting by length stops once the cap is reached; when
 * the seen line has scrolled out of the window, every kept line is new.
 */
export function unreadChatCount(lines: readonly Pick<ChatLine, "id">[], lastSeenId: string | null): number {
  if (lastSeenId == null) return lines.length;
  const at = lines.findIndex((l) => l.id === lastSeenId);
  return at < 0 ? lines.length : lines.length - 1 - at;
}
