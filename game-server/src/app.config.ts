import {
  defineServer,
  defineRoom,
  monitor,
  playground,
} from "colyseus";
import { getDefsHealthSnapshot } from "@optcg/rules";
import { PROTOCOL_VERSION } from "./protocol.js";
import { DuelRoom } from "./rooms/DuelRoom.js";
import { MatchmakerRoom } from "./rooms/MatchmakerRoom.js";

const server = defineServer({
  rooms: {
    duel: defineRoom(DuelRoom),
    ranked_queue: defineRoom(MatchmakerRoom),
  },

  express: (app) => {
    app.get("/health", (_req, res) => {
      res.json({
        ok: true,
        service: "optcg-game-server",
        rooms: ["duel", "ranked_queue"],
        // Catch client/server skew (v2 client vs stale v1 GS surfaces as
        // misleading "seat reservation expired" on create).
        protocolVersion: PROTOCOL_VERSION,
        // Catch stale deploys missing curated stubs (e.g. Teach OP16-080).
        defs: getDefsHealthSnapshot(),
      });
    });

    if (process.env.NODE_ENV !== "production") {
      app.use("/monitor", monitor());
      app.use("/", playground());
    }
  },
});

export default server;
