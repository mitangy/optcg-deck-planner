import type { Intent, PendingChoice } from "../../types.js";
import type { TurnMemory } from "../main.js";
import type { BotView } from "../types.js";

export interface PlaybookCtx { view: BotView; memory: TurnMemory | null }

export interface LeaderPlaybook {
  leaderId: string;
  name: string;
  mulligan?(hand: readonly string[], first: boolean): "keep" | "mulligan" | undefined;
  main?(view: BotView, memory: TurnMemory): Intent | undefined;
  allowLeaderActivate?(view: BotView): boolean;
  donReserve?(view: BotView): number;
  /** Must be idempotent: it is asked again after the intent. */
  beforeEndTurn?(view: BotView, memory: TurnMemory): Intent | undefined;
  defense?(view: BotView): Intent | undefined;
  playBonus?(view: BotView, defId: string): number;
  answerChoice?(view: BotView, choice: PendingChoice): Intent | undefined;
}
