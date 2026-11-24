export type LogPoseChrome = { compass: boolean; panel: boolean };

export function logPoseChrome(o: { enabled: boolean | null; hidden: boolean; launcher: boolean; open: boolean; requestable?: boolean }): LogPoseChrome {
  const on = (o.enabled === true || o.requestable === true) && !o.hidden;
  return { compass: on && o.launcher && !o.open, panel: on && o.open };
}
