import {
  defineServer,
  defineRoom,
  monitor,
  playground,
} from "colyseus";
import { getDefsDebugSnapshot } from "@optcg/rules";
import { DuelRoom } from "./rooms/DuelRoom.js";
import { MatchmakerRoom } from "./rooms/MatchmakerRoom.js";

const server = defineServer({
  rooms: {
    duel: defineRoom(DuelRoom),
    ranked_queue: defineRoom(MatchmakerRoom),
  },

  express: (app) => {
    app.get("/health", (_req, res) => {
      // #region agent log
      const defs = getDefsDebugSnapshot();
      // #endregion
      res.json({
        ok: true,
        service: "optcg-game-server",
        rooms: ["duel", "ranked_queue"],
        // Debug probe: whether Teach leader stub is loaded in this process.
        defs,
      });
    });

    if (process.env.NODE_ENV !== "production") {
      app.use("/monitor", monitor());
      app.use("/", playground());
    }
  },
});

export default server;
