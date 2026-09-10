import { schema, t, type SchemaType } from "@colyseus/schema";

/**
 * Public lobby fields only — never put hands / life faces / deck order here.
 */
export const DuelPublicState = schema({
  matchId: t.string(),
  seatsFilled: t.number(),
  phase: t.string(),
  activeSeat: t.number(),
  /** -1 when no winner yet */
  winner: t.number(),
  protocolVersion: t.number(),
});

export type DuelPublicState = SchemaType<typeof DuelPublicState>;
