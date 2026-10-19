import type { StatsAtlas } from "./deckStats";

/** The atlas file's hashed URL no longer exists: the page was loaded before a deploy replaced it. */
export class StaleAtlasError extends Error {
  constructor() {
    super("Deck stats were updated. Reload the page to load them.");
    this.name = "StaleAtlasError";
  }
}

/**
 * Turns the atlas fetch response into the atlas or an error. After a deploy the old hashed file is
 * gone and an SPA fallback may answer 200 with index.html, so a 404 or a non-JSON body means stale.
 */
export async function parseAtlasResponse(res: Response): Promise<StatsAtlas> {
  if (res.status === 404) throw new StaleAtlasError();
  if (!res.ok) throw new Error(`Card stats unavailable (${res.status})`);
  if (!(res.headers.get("content-type") ?? "").toLowerCase().includes("json")) throw new StaleAtlasError();
  try {
    return (await res.json()) as StatsAtlas;
  } catch {
    throw new StaleAtlasError();
  }
}
