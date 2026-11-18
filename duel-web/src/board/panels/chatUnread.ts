import type { ChatLine } from "../../net/protocol";

// Chat keeps only the last 100 lines, so counting by length stops at the cap; a seen line that scrolled out of the window means every kept line is new.
export function unreadChatCount(lines: readonly Pick<ChatLine, "id">[], lastSeenId: string | null): number {
  if (lastSeenId == null) return lines.length;
  const at = lines.findIndex((l) => l.id === lastSeenId);
  return at < 0 ? lines.length : lines.length - 1 - at;
}
