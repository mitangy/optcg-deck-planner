/**
 * Reviewed, hand-authored ability definitions. An entry replaces the generated
 * definition for that card entirely. Use for text the compiler cannot express
 * or expresses incorrectly. Each entry must stay plain JSON-compatible data.
 */
import type { CardAbilities } from "../effects/types.js";

export type ManualEntry = Pick<CardAbilities, "abilities"> & Partial<Pick<CardAbilities, "unsupported" | "status">>;

export const MANUAL_ABILITIES: Record<string, ManualEntry> = {};
