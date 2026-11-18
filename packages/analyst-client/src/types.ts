import type { ReactNode } from "react";
import type { ChoiceAnswer, DeckContext, GameChatContext, TurnPlan } from "./client";
import type { DockSides } from "./panelDock";
import type { LogPoseScope } from "./scopes";

export type OwnClaude = { href?: string; onSelect?: () => void };

export type LogPosePage = {
  page?: string;
  label?: string;
  deck?: DeckContext;
  matchId?: string;
  scope?: LogPoseScope;
  starters?: string[];
  // Passed by value, not through JSON: memoize it so it only changes when what it shows does.
  pinned?: ReactNode;
};

export type LogPoseGame = {
  label: string;
  scope?: LogPoseScope;
  context: () => GameChatContext | null;
  renderPlan: (plan: TurnPlan, ctx: { busy: boolean; ask: (text: string) => void }) => ReactNode;
  starters?: string[];
  // Never called for an answer read back from a saved chat.
  onLivePlan?: (plan: TurnPlan) => void;
  onLiveChoice?: (answer: ChoiceAnswer) => void;
};

export type GameAskResult = { sent: boolean; plan: boolean; choice: boolean; error: boolean; aborted: boolean };

export type DockHosts = { columns: boolean; left: HTMLElement | null; right: HTMLElement | null; sides?: DockSides };
