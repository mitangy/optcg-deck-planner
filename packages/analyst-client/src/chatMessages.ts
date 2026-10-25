import type { PlacedCitation } from "./citations";
import type { ThreadMessage, TurnPlan } from "./client";
import type { NewDeckDraft } from "./drafts";
import type { DeckEditProposal } from "./proposals";

/** One bubble in the panel. */
export type Msg = {
  role: "user" | "assistant";
  text: string;
  citations: PlacedCitation[];
  proposals?: DeckEditProposal[];
  drafts?: NewDeckDraft[];
  plans?: TurnPlan[];
  stopped?: boolean;
  /** The answer is stored in the thread (it finished, or it came from the saved thread), so it can be rated (#679). */
  saved?: boolean;
  /** Answered in this session, not loaded from the saved thread: only live edits and decks act by themselves (#726). */
  live?: boolean;
};

/** The empty answer a new question streams into. */
export const liveAnswer = (): Msg => ({ role: "assistant", text: "", citations: [], live: true });

/** A bubble from the saved thread: never live, so a reload never applies an old edit or opens an old deck. */
export const fromHistory = (m: ThreadMessage): Msg => ({
  role: m.role,
  text: m.text,
  citations: m.citations ?? [],
  proposals: m.proposals ?? [],
  drafts: m.drafts ?? [],
  saved: true,
});
