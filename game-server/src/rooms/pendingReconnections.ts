type PendingReconnection = [string, { reject(reason?: unknown): void }];

// Colyseus keeps the seats it holds for dropped clients in a private `_reconnections` map
// (token -> [sessionId, deferred]). Seat takeover has to cancel them, so this is the one place that reads it.
// The shape is checked every time: a Colyseus upgrade that changes it throws here instead of leaving a
// dropped session able to reclaim a seat that was taken over.
function pendingReconnectionsOf(room: object): PendingReconnection[] {
  const raw = (room as { _reconnections?: unknown })._reconnections;
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("Colyseus Room._reconnections is not a record; the pinned Colyseus version changed");
  }
  const entries = Object.values(raw as Record<string, unknown>);
  for (const entry of entries) {
    const ok =
      Array.isArray(entry) &&
      typeof entry[0] === "string" &&
      entry[1] !== null &&
      typeof entry[1] === "object" &&
      typeof (entry[1] as { reject?: unknown }).reject === "function";
    if (!ok) throw new Error("Colyseus Room._reconnections entries are not [sessionId, deferred]");
  }
  return entries as PendingReconnection[];
}

// Rejects every reclaim still pending for `sessionId` so its old reconnection token can never take the seat back.
export function rejectPendingReconnections(room: object, sessionId: string): void {
  for (const entry of pendingReconnectionsOf(room)) {
    if (entry[0] === sessionId) entry[1].reject(false);
  }
}
