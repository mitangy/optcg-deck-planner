/**
 * Registry of leader playbooks (#1173). `playbooks` in BotOptions picks which ones a bot uses: true = every registered
 * playbook (default), false = none, a list = only those leader ids. Easy never uses playbooks.
 */
import type { BotView } from "../types.js";
import { buggyPlaybook } from "./buggy.js";
import { kaidoPlaybook } from "./kaido.js";
import { rocksPlaybook } from "./rocks.js";
import { rosinantePlaybook } from "./rosinante.js";
import { saboPlaybook } from "./sabo.js";
import type { LeaderPlaybook } from "./types.js";

export type { LeaderPlaybook, PlaybookCtx } from "./types.js";

export type PlaybookSetting = boolean | readonly string[];

/** Mutable on purpose: tests register throwaway playbooks. */
export const PLAYBOOKS: Record<string, LeaderPlaybook> = Object.fromEntries(
  [rosinantePlaybook, kaidoPlaybook, saboPlaybook, rocksPlaybook, buggyPlaybook].map((p) => [p.leaderId, p]),
);

/** The playbook the setting enables for the seat's own Leader, if any. */
export function playbookFor(view: BotView, setting: PlaybookSetting = true): LeaderPlaybook | undefined {
  if (setting === false) return undefined;
  const id = view.you.leader.defId;
  if (setting !== true && !setting.includes(id)) return undefined;
  return PLAYBOOKS[id];
}
