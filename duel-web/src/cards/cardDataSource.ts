import atlasJson from "../assets/cardAtlas.json";
import catalogJson from "../assets/cardCatalog.json";
import type { CardData } from "./cardData";

/**
 * The only module that imports the card JSON. Reach it through `loadCardData()` (a dynamic import), never a
 * static import from app code, or the data lands back in the entry chunk. Tests and the prerender may import it.
 */
export const cardData: CardData = { curated: atlasJson, catalog: catalogJson };
