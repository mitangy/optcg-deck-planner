import { schema, t, type SchemaType } from "@colyseus/schema";

export const DuelPublicState = schema({
  matchId: t.string(),
  seatsFilled: t.number(),
  phase: t.string(),
  activeSeat: t.number(),
  winner: t.number(),
  protocolVersion: t.number(),
});

export type DuelPublicState = SchemaType<typeof DuelPublicState>;
