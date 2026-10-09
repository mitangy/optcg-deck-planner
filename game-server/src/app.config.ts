import {
  defineServer,
  defineRoom,
  matchMaker,
  monitor,
  playground,
  WebSocketTransport,
} from "colyseus";
import { getDefsHealthSnapshot } from "@optcg/rules";
import { getSeatReservationSeconds, requireGameToken } from "./env.js";
import { verifyGameToken } from "./gameToken.js";
import {
  PROTOCOL_VERSION,
  SKIN_MAX_CARD_BACK_CHARS,
  SKIN_MAX_PLAYMAT_CHARS,
} from "./protocol.js";
import { DuelRoom, hashToNegativeId } from "./rooms/DuelRoom.js";
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

/** Account uid for GET /active-matches: a game token, or ?devUserId= when tokens aren't required. */
function activeMatchesCaller(authorization: string | undefined, devUserId: unknown): number | null {
  const bearer = /^Bearer\s+(.+)$/i.exec(authorization ?? "")?.[1]?.trim();
  if (bearer) return verifyGameToken(bearer)?.uid ?? null;
  if (!requireGameToken() && typeof devUserId === "string" && devUserId.trim()) {
    return hashToNegativeId(devUserId.trim());
  }
  return null;
}

const server = defineServer({
  transport: new WebSocketTransport({ maxPayload: WS_MAX_PAYLOAD_BYTES }),

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
      });
    });

    // CORS (incl. the Authorization preflight) comes from Colyseus' request listener
    // and the allowlist installed by installCorsAllowlist, same as matchmake.
    // Live matches a signed-in account holds a seat in, so it can resume one on
    // another device (#451). Owners come from room metadata, not room state.
    app.get("/active-matches", async (req, res) => {
      const uid = activeMatchesCaller(req.get("authorization"), req.query.devUserId);
      if (uid === null) {
        res.status(401).json({ error: "unauthorized" });
        return;
      }
      const rooms = await matchMaker.query({ name: "duel" });
      const matches = rooms.flatMap((room) => {
        const meta = room.metadata as
          | { owners?: (number | null)[]; phase?: string; ranked?: boolean }
          | undefined;
        const owners = meta?.owners;
        if (!owners || meta?.phase === "finished") return [];
        const seats = ([0, 1] as const).filter((s) => owners[s] === uid);
        if (seats.length === 0) return [];
        return [
          {
            roomId: room.roomId,
            seats,
            practice: seats.length === 2,
            ranked: meta?.ranked === true,
            phase: meta?.phase ?? "waiting",
          },
        ];
      });
      matches.sort((a, b) => Number(b.phase === "playing") - Number(a.phase === "playing"));
      res.json({ matches });
    });

    if (process.env.NODE_ENV !== "production") {
      app.use("/monitor", monitor());
      app.use("/", playground());
    }
  },
});

export default server;
