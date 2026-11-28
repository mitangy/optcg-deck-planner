import { createContext } from "react";
import type { ParsedSource } from "./citations";

export type SourceHooks = {
  href?: (source: ParsedSource) => string | null;
  card?: (id: string) => { name?: string; imageUrl?: string } | null | undefined;
  deckHref?: (ref: string) => string | null;
  openDeck?: (ref: string) => boolean;
  /** Show a card enlarged in the app's own card view (above the Log Pose panel). Without it card art is not tappable. */
  openCard?: (id: string) => void;
  openNewDeck?: (draft: { name: string; list: string }, how: { auto: boolean }) => boolean;
};

/** Kept apart from Sources.tsx so the provider does not pull the citation views (and Markdown) in before the panel opens. */
export const SourceHooksContext = createContext<SourceHooks>({});
