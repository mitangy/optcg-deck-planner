const LABELS: Record<string, string> = {
  mulligan: "Mulligan",
  refresh: "Refresh",
  draw: "Draw",
  don: "DON!!",
  main: "Main",
  block: "Block",
  counter: "Counter",
  damage: "Damage",
  end: "End",
  game_over: "Match over",
};

/** The HUD's phase word: engine phases are snake_case ids, people read "Match over". */
export function phaseLabel(phase: string): string {
  return LABELS[phase] ?? phase.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());
}
