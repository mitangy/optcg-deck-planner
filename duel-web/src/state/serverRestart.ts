export function serverRestartNotice(seconds: number): string {
  const when = seconds > 0 ? ` in about ${seconds} second${seconds === 1 ? "" : "s"}` : "";
  return `The server is restarting for an update${when}. This game will end with no winner and won't count.`;
}
