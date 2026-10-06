import {
  defineServer,
  defineRoom,
  matchMaker,
  monitor,
  playground,
  WebSocketTransport,
} from "colyseus";
import { getDefsHealthSnapshot } from "@optcg/rules";
import { clusterOptions, wsCompression } from "./cluster.js";
import { getSeatReservationSeconds } from "./env.js";
import {
  PROTOCOL_VERSION,
  SKIN_MAX_CARD_BACK_CHARS,
  SKIN_MAX_PLAYMAT_CHARS,
} from "./protocol.js";
import { DuelRoom } from "./rooms/DuelRoom.js";
import { MatchmakerRoom } from "./rooms/MatchmakerRoom.js";

/**
 * Largest websocket frame a client may send. Colyseus' default is 4 KB, which
 * closes the socket (1009) on any real "skin" message: one message carries a
 * playmat and a card back of up to SKIN_MAX_PLAYMAT_CHARS +
 * SKIN_MAX_CARD_BACK_CHARS, plus JSON/msgpack overhead. 1 MB leaves headroom.
 */
export const WS_MAX_PAYLOAD_BYTES = 1024 * 1024;
if (WS_MAX_PAYLOAD_BYTES < SKIN_MAX_PLAYMAT_CHARS + SKIN_MAX_CARD_BACK_CHARS + 4096) {
  throw new Error("WS_MAX_PAYLOAD_BYTES must fit the largest skin message");
}

const server = defineServer({
  transport: new WebSocketTransport({ maxPayload: WS_MAX_PAYLOAD_BYTES, perMessageDeflate: wsCompression() }),
  ...clusterOptions(),

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
        // Confirm COLYSEUS_SEAT_RESERVATION_TIME landed on the Render pin.
        seatReservationSeconds: getSeatReservationSeconds(),
        // Catch stale deploys missing curated stubs (e.g. Teach OP16-080).
        defs: getDefsHealthSnapshot(),
        // Which build is live (blue/green deploys wait for it), and this
        // process's load, for scaling the pool.
        commit: process.env.RENDER_GIT_COMMIT ?? null,
        processId: matchMaker.processId,
        roomCount: matchMaker.stats.local.roomCount,
        ccu: matchMaker.stats.local.ccu,
      });
    });

    if (process.env.NODE_ENV !== "production") {
      app.use("/monitor", monitor());
      app.use("/", playground());
    }
  },
});

export default server;
