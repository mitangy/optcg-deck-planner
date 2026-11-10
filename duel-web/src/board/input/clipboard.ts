export { copyText } from "@optcg/ui/clipboard";

/** Link that opens the lobby's Join form with this room id filled in. */
export function roomInviteUrl(roomId: string): string {
  return `${window.location.origin}/?join=${encodeURIComponent(roomId)}`;
}

/** Link that opens straight into spectating this room (no lobby, no room id to type). */
export function spectateUrl(roomId: string): string {
  return `${window.location.origin}/watch/${encodeURIComponent(roomId)}`;
}
