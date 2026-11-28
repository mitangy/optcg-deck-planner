export { copyText } from "@optcg/ui/clipboard";

export function roomInviteUrl(roomId: string): string {
  // /join/ seats whoever opens it at once; the old /?join= link still opens the join sheet.
  return `${window.location.origin}/join/${encodeURIComponent(roomId)}`;
}

export function spectateUrl(roomId: string): string {
  return `${window.location.origin}/watch/${encodeURIComponent(roomId)}`;
}
