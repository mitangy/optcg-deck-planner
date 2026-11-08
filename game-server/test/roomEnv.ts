import { roomEnvSource, type EnvConfig } from "../src/rooms/duel/config.js";

/** Runs `fn` with every room created meanwhile using these environment settings, instead of mutating `process.env`. */
export async function withRoomEnv<T>(env: Partial<EnvConfig>, fn: () => Promise<T> | T): Promise<T> {
  const prev = roomEnvSource.override;
  roomEnvSource.override = { ...prev, ...env };
  try {
    return await fn();
  } finally {
    roomEnvSource.override = prev;
  }
}
