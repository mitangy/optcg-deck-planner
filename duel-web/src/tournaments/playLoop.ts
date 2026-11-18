import type { PlayResult } from "./tournamentApi";

export const WAIT_MS = 2000;
export const MAX_WAITS = 15;
export const OPPONENT_OPENING = "Your opponent is opening the room. Try again.";

export type RoomClaim = { action: "host" } | { action: "join"; room_id: string; server_url?: string | null };

export async function claimMatchRoom(
  play: () => Promise<PlayResult>,
  sleep: (ms: number) => Promise<void>,
): Promise<RoomClaim> {
  for (let waits = 0; ; waits++) {
    const r = await play();
    if (r.action === "host") return { action: "host" };
    if (r.action === "join" && r.room_id) return { action: "join", room_id: r.room_id, server_url: r.server_url };
    if (waits >= MAX_WAITS) throw new Error(OPPONENT_OPENING);
    await sleep(WAIT_MS);
  }
}
