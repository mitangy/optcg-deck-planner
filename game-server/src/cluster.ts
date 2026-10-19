import { RedisDriver, RedisPresence } from "colyseus";
import type { MatchMakerDriver, Presence } from "colyseus";

/**
 * Several game-server processes share rooms through Redis: any process can
 * create a room, reserve a seat or find a room by id, and each process
 * advertises its own public address so a client's socket goes straight to the
 * process that holds its room. A single process (no REDIS_URL) keeps
 * everything in memory, as before.
 *
 * Pools for blue/green deploys use separate Redis databases (redis://host/1,
 * redis://host/2), so a draining pool keeps its own rooms and queue.
 */
export type ClusterOptions = {
  presence?: Presence;
  driver?: MatchMakerDriver;
  publicAddress?: string;
};

export function clusterOptions(env: NodeJS.ProcessEnv = process.env): ClusterOptions {
  const out: ClusterOptions = {};
  const publicAddress = env.PUBLIC_ADDRESS?.trim();
  if (publicAddress) out.publicAddress = publicAddress;
  const redisUrl = env.REDIS_URL?.trim();
  if (!redisUrl) return out;
  if (!publicAddress && env.NODE_ENV === "production") {
    // Without its own address a process's rooms are only reachable when the
    // client happens to land on it: refuse to start half-configured.
    throw new Error("PUBLIC_ADDRESS is required when REDIS_URL is set in production");
  }
  out.presence = new RedisPresence(redisUrl);
  out.driver = new RedisDriver(redisUrl);
  return out;
}

/**
 * permessage-deflate for game messages. A board view is ~3 KB of msgpack and
 * deflates ~3.5x. No context takeover keeps per-socket zlib memory flat, and
 * small messages (timers, pings) skip compression.
 */
export function wsCompression(env: NodeJS.ProcessEnv = process.env) {
  if (env.WS_COMPRESSION === "off") return false as const;
  return {
    threshold: 512,
    serverNoContextTakeover: true,
    clientNoContextTakeover: true,
    zlibDeflateOptions: { level: 1 },
  };
}
