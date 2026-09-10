import type { CardDef, CardDefId } from "../types.js";

const defs: CardDef[] = [
  {
    id: "leader_red_5k",
    name: "Placeholder Red Leader",
    type: "leader",
    colors: ["red"],
    cost: 0,
    power: 5000,
    life: 5,
  },
  {
    id: "char_vanilla_2k",
    name: "Placeholder Vanilla 2000",
    type: "character",
    colors: ["red"],
    cost: 1,
    power: 2000,
    counter: 1000,
  },
  {
    id: "char_curve_4k",
    name: "Placeholder Curve 4000",
    type: "character",
    colors: ["red"],
    cost: 3,
    power: 4000,
    counter: 1000,
  },
  {
    id: "char_blocker_3k",
    name: "Placeholder Blocker 3000",
    type: "character",
    colors: ["red"],
    cost: 2,
    power: 3000,
    blocker: true,
  },
  {
    id: "event_main_draw",
    name: "Placeholder Main Draw",
    type: "event",
    colors: ["red"],
    cost: 1,
    eventTiming: "main",
    mainDraw: 1,
  },
  {
    id: "event_counter_1k",
    name: "Placeholder Counter +1000",
    type: "event",
    colors: ["red"],
    cost: 0,
    eventTiming: "counter",
    counterPowerBonus: 1000,
  },
  {
    id: "stage_small_buff",
    name: "Placeholder Stage Leader +1000",
    type: "stage",
    colors: ["red"],
    cost: 1,
    stageLeaderPowerBonus: 1000,
  },
  {
    id: "char_trigger_draw",
    name: "Placeholder Trigger Draw",
    type: "character",
    colors: ["red"],
    cost: 2,
    power: 3000,
    counter: 1000,
    triggerDraw: 1,
  },
];

const byId = new Map(defs.map((d) => [d.id, d]));

export function getCardDef(id: CardDefId): CardDef {
  const d = byId.get(id);
  if (!d) throw new Error(`Unknown card def: ${id}`);
  return d;
}

export function listCardDefs(): CardDef[] {
  return defs.slice();
}

export function buildTestDeck(size = 20): CardDefId[] {
  const pool: CardDefId[] = [
    "char_vanilla_2k",
    "char_vanilla_2k",
    "char_vanilla_2k",
    "char_vanilla_2k",
    "char_curve_4k",
    "char_curve_4k",
    "char_curve_4k",
    "char_curve_4k",
    "char_blocker_3k",
    "char_blocker_3k",
    "char_blocker_3k",
    "char_blocker_3k",
    "event_main_draw",
    "event_main_draw",
    "event_main_draw",
    "event_main_draw",
    "event_counter_1k",
    "event_counter_1k",
    "event_counter_1k",
    "event_counter_1k",
    "stage_small_buff",
    "stage_small_buff",
    "stage_small_buff",
    "stage_small_buff",
  ];
  if (size > pool.length) throw new Error(`buildTestDeck max ${pool.length}`);
  return pool.slice(0, size);
}
