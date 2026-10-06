export type MatchMenuItemId = "copy-room" | "copy-spectate" | "settings" | "fullscreen" | "reload" | "concede" | "leave";

/**
 * Which entries the phone HUD's ⋯ menu shows, in display order (destructive
 * ones last). Reload rejoins the saved match. Concede is for live players only; hotseat has no room to share. Spectators can share the watch link too.
 */
export function matchMenuItems(o: {
  spectating: boolean;
  over: boolean;
  hotseat: boolean;
  fullscreenOffered: boolean;
  canConcede: boolean;
}): MatchMenuItemId[] {
  const items: MatchMenuItemId[] = [];
  if (!o.hotseat) items.push("copy-room", "copy-spectate");
  items.push("settings");
  if (o.fullscreenOffered) items.push("fullscreen");
  // A Home Screen app has no browser reload button or pull-to-refresh.
  items.push("reload");
  if (o.canConcede && !o.spectating && !o.over) items.push("concede");
  items.push("leave");
  return items;
}
