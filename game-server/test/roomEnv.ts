import { roomEnvSource, type EnvConfig } from "../src/rooms/duel/config.js";

export async function withRoomEnv<T>(env: Partial<EnvConfig>, fn: () => Promise<T> | T): Promise<T> {
  const prev = roomEnvSource.override;
  roomEnvSource.override = { ...prev, ...env };
  try {
    return await fn();
  } finally {
    roomEnvSource.override = prev;
  }
}
