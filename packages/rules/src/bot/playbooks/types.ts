/**
 * Leader playbooks (#1173): per-leader hints that override the generic Normal policy only while the bot's Leader is that
 * leader. The generic policy stays card-agnostic; a playbook adds what it cannot know (a Leader ability it would never
 * use, a DON!! attach plan, a "may" that is only worth paying in some positions). Every hook is optional, and an
 * answer outside the view's legal moves is ignored, so a playbook can never make the bot send an illegal intent.
 */
import type { Intent, PendingChoice } from "../../types.js";
import type { TurnMemory } from "../main.js";
import type { BotView } from "../types.js";

export interface PlaybookCtx { view: BotView; memory: TurnMemory | null }

export interface LeaderPlaybook {
  /** The Leader this playbook is for, e.g. "OP12-061". */
  leaderId: string;
  /** Display name, e.g. "Donquixote Rosinante". */
  name: string;
  /** Mulligan verdict, or undefined to use the generic rule. `hand` = card ids. */
  mulligan?(hand: readonly string[], first: boolean): "keep" | "mulligan" | undefined;
  /** Main phase, before the generic policy: an intent from `view.legalIntents` to send now, or undefined. For Leader [Activate: Main] timing and DON!! attach. */
  main?(view: BotView, memory: TurnMemory): Intent | undefined;
  /** Generic Leader [Activate: Main] use: false vetoes the generic policy activating the Leader's own ability now. */
  allowLeaderActivate?(view: BotView): boolean;
  /** Active DON!! the generic policy must leave unspent (plays and gives) this main phase. */
  donReserve?(view: BotView): number;
  /** Called when the generic main-phase policy is about to end the turn: a legal intent (e.g. a give_don) to send instead, or undefined. Must be idempotent: it is asked again after the intent. */
  beforeEndTurn?(view: BotView, memory: TurnMemory): Intent | undefined;
  /** Block and counter steps (Normal and Hard's base pick), before the generic defense: a legal intent (e.g. pass) to send, or undefined. */
  defense?(view: BotView): Intent | undefined;
  /** Added to the generic play score of a hand card (`defId`) when choosing what to play. */
  playBonus?(view: BotView, defId: string): number;
  /** Answer to a pending choice raised by the Leader's own ability (`choice.cardDefId === leaderId`), or undefined for the generic answer. */
  answerChoice?(view: BotView, choice: PendingChoice): Intent | undefined;
}
