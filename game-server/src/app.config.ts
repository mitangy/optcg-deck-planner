import {
  defineServer,
  defineRoom,
  monitor,
  playground,
} from "colyseus";
import { DuelRoom } from "./rooms/DuelRoom.js";

const server = defineServer({
  rooms: {
    duel: defineRoom(DuelRoom),
  },

  express: (app) => {
    app.get("/health", (_req, res) => {
      res.json({ ok: true, service: "optcg-game-server" });
    });

    if (process.env.NODE_ENV !== "production") {
      app.use("/monitor", monitor());
      app.use("/", playground());
    }
  },
});

export default server;
