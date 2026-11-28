/** The game server's process id from /health: it changes on every restart. Null when the server does not answer. */
export async function fetchServerBootId(serverUrl: string, fetchImpl: typeof fetch = fetch, timeoutMs = 4000): Promise<string | null> {
  try {
    const res = await fetchImpl(`${serverUrl.replace(/\/$/, "")}/health`, { signal: AbortSignal.timeout(timeoutMs) });
    if (!res.ok) return null;
    const body = (await res.json()) as { processId?: unknown };
    return typeof body.processId === "string" && body.processId ? body.processId : null;
  } catch {
    return null;
  }
}
