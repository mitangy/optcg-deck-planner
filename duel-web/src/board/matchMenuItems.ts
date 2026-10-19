export type MatchMenuItemId = "copy-room" | "copy-spectate" | "settings" | "fullscreen" | "reload" | "report" | "concede" | "leave";

/**
 * Which entries the phone HUD's ⋯ menu shows, in display order (destructive
 * ones last). Reload rejoins the saved match; Report a problem opens the feedback dialog. Concede is for live players only; hotseat has no room to share. Spectators can share the watch link too. A replay has no room to share.
 */
export function matchMenuItems(o: {
  spectating: boolean;
  over: boolean;
  hotseat: boolean;
  fullscreenOffered: boolean;
  canConcede: boolean;
  /** A recorded game: there is no room to share and nothing to concede. */
  replay?: boolean;
}): MatchMenuItemId[] {
  const items: MatchMenuItemId[] = [];
  if (!o.hotseat) items.push("copy-room", "copy-spectate");
  items.push("settings");
  if (o.fullscreenOffered) items.push("fullscreen");
  // A Home Screen app has no browser reload button or pull-to-refresh.
  items.push("reload");
  // Every match, hotseat, demo and spectating included: a bug report needs no room.
  items.push("report");
  if (o.canConcede && !o.spectating && !o.over) items.push("concede");
  items.push("leave");
  // A recording has no room to share and nothing to concede.
  return o.replay ? items.filter((id) => id !== "copy-room" && id !== "copy-spectate" && id !== "concede") : items;
}
