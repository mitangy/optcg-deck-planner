import type { AdminFunnel } from "./adminApi";
import { dayLabel, percent } from "./adminLogic";

const STEP_LABELS: Record<string, string> = {
  landing: "Landed on a guide page",
  home_view: "Saw the home page",
  game_start: "Started a game",
  game_done: "Finished a game",
  signup: "Signed up",
};

export type FunnelRow = { step: string; label: string; visitors: number; events: number; barPct: number; ofPrevious: string | null };

/** Each step's bar is scaled to the busiest step; `ofPrevious` is the share of the step above that reached it. */
export function funnelRows(steps: AdminFunnel["steps"]): FunnelRow[] {
  const top = Math.max(1, ...steps.map((s) => s.visitors));
  return steps.map((s, i) => ({
    step: s.step,
    label: STEP_LABELS[s.step] ?? s.step,
    visitors: s.visitors,
    events: s.events,
    barPct: (s.visitors / top) * 100,
    ofPrevious: i === 0 ? null : percent(s.visitors, steps[i - 1]!.visitors),
  }));
}

export type RetentionRow = { week: string; size: number; d1: string; d7: string; d1Detail: string; d7Detail: string };

/** A rate over zero accounts is a dash: an account has to be old enough to have had the chance to return. */
export function retentionRows(cohorts: AdminFunnel["retention"]): RetentionRow[] {
  return cohorts.map((c) => ({
    week: dayLabel(c.week_start).replace(/^\w+, /, ""),
    size: c.size,
    d1: percent(c.d1_returned, c.d1_eligible),
    d7: percent(c.d7_returned, c.d7_eligible),
    d1Detail: `${c.d1_returned} of ${c.d1_eligible}`,
    d7Detail: `${c.d7_returned} of ${c.d7_eligible}`,
  }));
}
