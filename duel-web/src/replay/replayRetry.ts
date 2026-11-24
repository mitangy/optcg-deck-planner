import { ReplayLoadError } from "./replayApi";

export const IN_PROGRESS_RETRY_DELAYS_S = [2, 4, 8];

export type ReplayNavState = { fromMatchOver?: boolean } | null;

export async function loadWhileSaving<T>(
  load: () => Promise<T>,
  opts: {
    delaysS?: readonly number[];
    wait?: (ms: number) => Promise<void>;
    onWait?: () => void;
    cancelled?: () => boolean;
  } = {},
): Promise<T> {
  const delays = opts.delaysS ?? IN_PROGRESS_RETRY_DELAYS_S;
  const wait = opts.wait ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  for (let i = 0; ; i++) {
    try {
      return await load();
    } catch (e) {
      const again = e instanceof ReplayLoadError && e.reason === "in-progress" && i < delays.length && !opts.cancelled?.();
      if (!again) throw e;
      opts.onWait?.();
      await wait(delays[i]! * 1000);
    }
  }
}
