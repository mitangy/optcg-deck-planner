export type MatchMenuItemId = "copy-room" | "settings" | "fullscreen" | "concede" | "leave";

/**
 * Which entries the phone HUD's ⋯ menu shows, in display order (destructive
 * ones last). Concede is for live players only; hotseat has no room to share.
 */
export function matchMenuItems(o: {
  spectating: boolean;
  over: boolean;
  hotseat: boolean;
  fullscreenOffered: boolean;
  canConcede: boolean;
}): MatchMenuItemId[] {
  const items: MatchMenuItemId[] = [];
  if (!o.hotseat) items.push("copy-room");
  items.push("settings");
  if (o.fullscreenOffered) items.push("fullscreen");
  if (o.canConcede && !o.spectating && !o.over) items.push("concede");
  items.push("leave");
  return items;
}
