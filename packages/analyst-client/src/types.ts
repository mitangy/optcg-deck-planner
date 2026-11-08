import type { ReactNode } from "react";
import type { ChoiceAnswer, DeckContext, GameChatContext, TurnPlan } from "./client";
import type { DockSides } from "./panelDock";
import type { LogPoseScope } from "./scopes";

/** How a player out of credit can use Log Pose on their own Claude plan: a link, or a function that takes them there (the app's Settings). */
export type OwnClaude = { href?: string; onSelect?: () => void };

/** What the current page tells Log Pose: shown as the "Looking at" chip and sent with each message. */
export type LogPosePage = {
  /** Short page id sent as context.page (e.g. "deck-editor"). */
  page?: string;
  /** Chip text: "Looking at: <label>". Without it no chip is shown and no deck / match is sent. */
  label?: string;
  deck?: DeckContext;
  matchId?: string;
  /** Which chat the panel opens on this page (a deck's, a match's). Without it the page uses the general chat. */
  scope?: LogPoseScope;
  /** Prompt chips offered while the thread is empty. */
  starters?: string[];
  /**
   * Content the page keeps at the top of the chat, above the messages (the matchup brief on a board). Passed by
   * value, not through JSON: memoize it so it only changes when what it shows does.
   */
  pinned?: ReactNode;
};

/**
 * A live game the page lets Log Pose see and plan for (the duel board in a casual or practice game). While one is
 * registered every message carries `context.game`, taken when the message is sent.
 */
export type LogPoseGame = {
  /** Chip text: "Looking at: <label>". */
  label: string;
  /** The match's chat (`match:<game key>`): it wins over the page's scope while the game is registered. */
  scope?: LogPoseScope;
  /** The game as it is right now, or null when it can't be read (the message goes without it). */
  context: () => GameChatContext | null;
  /** The Turn plan card for a plan under an answer. `ask` sends a message as the player. */
  renderPlan: (plan: TurnPlan, ctx: { busy: boolean; ask: (text: string) => void }) => ReactNode;
  /** Prompt chips offered while the thread is empty, instead of the page's. */
  starters?: string[];
  /**
   * A turn plan just arrived from Log Pose's live answer (never called for an answer read back from a saved
   * chat), stamped with its game. The board starts it by itself when the player asked Log Pose to play the turn.
   */
  onLivePlan?: (plan: TurnPlan) => void;
  /** Log Pose just answered a pending choice in its live answer (never for a saved chat); the board applies it. */
  onLiveChoice?: (answer: ChoiceAnswer) => void;
};

/**
 * How a request the board sent for the player ended. `sent` is false when it never went out (no game to read, the
 * chat was reset); `plan` / `choice` say whether the answer carried a turn plan / an answered choice.
 */
export type GameAskResult = { sent: boolean; plan: boolean; choice: boolean; error: boolean; aborted: boolean };

/**
 * Where a game board lets Log Pose dock: `columns` is false when the board has no side columns (narrow window,
 * landscape phone), and the panel then floats. `left` / `right` are the elements the panel renders into.
 */
export type DockHosts = { columns: boolean; left: HTMLElement | null; right: HTMLElement | null; sides?: DockSides };
