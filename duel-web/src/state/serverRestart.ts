// A deploy closes every live game. The game is saved as a cut-off log only: no winner, no rating change.
export const SERVER_RESTART_ENDED =
  "The server restarted for an update, so your game ended with no winner and didn't count. You can start a new one.";

export function serverRestartNotice(seconds: number): string {
  const when = seconds > 0 ? ` in about ${seconds} second${seconds === 1 ? "" : "s"}` : "";
  return `The server is restarting for an update${when}. This game will end with no winner and won't count.`;
}
