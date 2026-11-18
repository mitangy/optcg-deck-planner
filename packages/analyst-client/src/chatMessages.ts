import type { PlacedCitation } from "./citations";
import type { ChoiceAnswer, ThreadMessage, TurnPlan } from "./client";
import type { NewDeckDraft } from "./drafts";
import type { DeckEditProposal } from "./proposals";

export type Msg = {
  role: "user" | "assistant";
  text: string;
  citations: PlacedCitation[];
  proposals?: DeckEditProposal[];
  drafts?: NewDeckDraft[];
  plans?: TurnPlan[];
  choices?: ChoiceAnswer[];
  stopped?: boolean;
  saved?: boolean;
  live?: boolean;
};

export const liveAnswer = (): Msg => ({ role: "assistant", text: "", citations: [], live: true });

// Never live, so a reload never applies an old edit or opens an old deck.
export const fromHistory = (m: ThreadMessage): Msg => ({
  role: m.role,
  text: m.text,
  citations: m.citations ?? [],
  proposals: m.proposals ?? [],
  drafts: m.drafts ?? [],
  saved: true,
});
