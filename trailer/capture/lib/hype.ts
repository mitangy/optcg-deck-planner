import { startTake, type Take } from "./take";
import { MIKO } from "./data";
import { MIKO_STATS, friendsOfMiko } from "./world";
import type { FakeOptions } from "./fakeApi";
import type { Seed } from "./data";

/** Hype clips are framed in a 4:3-ish browser window so the board stays readable inside a 9:16 video. */
/** Hover popups cover the board in a framed 4:3 capture, so they are off. */
export const HYPE_SETTINGS = { handLayout: "fan", previewPopup: false };
export const HYPE_WINDOW = { width: 1440, height: 1080 } as const;

export async function hypeTake(id: string, opts: { seed?: Seed; gameSeed?: number; fake?: Partial<FakeOptions>; window?: Partial<typeof HYPE_WINDOW> & Record<string, unknown>; area?: { width: number; height: number; display?: string } } = {}): Promise<Take> {
  const win = { ...HYPE_WINDOW, ...opts.window };
  return startTake({
    id,
    gameSeed: opts.gameSeed ?? 11,
    seed: opts.seed ?? { settings: HYPE_SETTINGS },
    window: win,
    area: opts.area ?? { width: win.width as number, height: win.height as number },
    fake: { me: { ...MIKO, ...MIKO_STATS }, friends: friendsOfMiko(), ...opts.fake },
  });
}
