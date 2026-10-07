/** What of Log Pose's own chrome (the compass launcher, the chat panel) is on screen. React-free so it can be tested. */
export type LogPoseChrome = { compass: boolean; panel: boolean };

/**
 * `hidden` hides everything (a live match). `launcher: false` keeps the panel but draws no compass,
 * for pages that open it from their own button. Nothing shows until chat is known to be on.
 */
export function logPoseChrome(o: { enabled: boolean | null; hidden: boolean; launcher: boolean; open: boolean }): LogPoseChrome {
  const on = o.enabled === true && !o.hidden;
  return { compass: on && o.launcher && !o.open, panel: on && o.open };
}
