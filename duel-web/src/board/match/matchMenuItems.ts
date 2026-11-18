export type MatchMenuItemId = "copy-room" | "copy-spectate" | "settings" | "fullscreen" | "mute-tab" | "reload" | "report-player" | "report" | "hide-art" | "concede" | "leave";

export function matchMenuItems(o: {
  spectating: boolean;
  over: boolean;
  hotseat: boolean;
  fullscreenOffered: boolean;
  fullscreenInBar?: boolean;
  muteInBar?: boolean;
  canConcede: boolean;
  replay?: boolean;
  canReportPlayer?: boolean;
  hideArtOffered?: boolean;
}): MatchMenuItemId[] {
  const items: MatchMenuItemId[] = [];
  if (!o.hotseat) items.push("copy-room", "copy-spectate");
  items.push("settings");
  if (o.fullscreenOffered && !o.fullscreenInBar) items.push("fullscreen");
  if (!o.muteInBar) items.push("mute-tab");
  items.push("reload");
  if (o.canReportPlayer && !o.replay) items.push("report-player");
  if (o.hideArtOffered && !o.hotseat) items.push("hide-art");
  // A bug report needs no room.
  items.push("report");
  if (o.canConcede && !o.spectating && !o.over) items.push("concede");
  items.push("leave");
  return o.replay ? items.filter((id) => id !== "copy-room" && id !== "copy-spectate" && id !== "concede") : items;
}
