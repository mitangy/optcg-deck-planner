/** Slash commands typed into the match chat. Only a whole-message command counts. */
export type ChatCommand = { kind: "concede" } | null;

const CONCEDE = new Set(["/ff", "/surrender", "/concede"]);

/** `/ff`, `/surrender`, `/concede` (trimmed, any case) are commands; anything else is chat. */
export function parseChatCommand(text: string): ChatCommand {
  return CONCEDE.has(text.trim().toLowerCase()) ? { kind: "concede" } : null;
}
