export type ChatCommand = { kind: "concede" } | null;

const CONCEDE = new Set(["/ff", "/surrender", "/concede"]);

export function parseChatCommand(text: string): ChatCommand {
  return CONCEDE.has(text.trim().toLowerCase()) ? { kind: "concede" } : null;
}
