/**
 * One take = browser window(s) on the Xvfb screen, a fake backend, a recorder. A clip script prepares the page
 * until it is on a clean first frame, then `rec.start()`s, performs, and `finish()`es.
 */
import { openWindow, type Win, type WindowSpec } from "./browser";
import { installCursor, Pointer, type CursorStyle } from "./cursor";
import { installFakeApi, type FakeOptions, World } from "./fakeApi";
import { seedProfile, type Seed } from "./data";
import { GAME_SERVER, WEB_ORIGIN, DISPLAY } from "./env";
import { Recorder, still, type RecordArea } from "./recorder";
import { sleep } from "./util";

export type TakeOpts = {
  id: string;
  window?: Partial<WindowSpec>;
  cursor?: CursorStyle;
  fake: FakeOptions;
  seed?: Seed;
  /** Shuffle seed added to every room the browser creates, so the game repeats take after take. */
  gameSeed?: number;
  area?: RecordArea;
};

export type Take = {
  id: string;
  win: Win;
  page: Win["page"];
  pointer: Pointer;
  rec: Recorder;
  world: World;
  goto(path: string): Promise<void>;
  errors: string[];
};

export async function checkStack(): Promise<void> {
  for (const [name, url] of [["game server", `${GAME_SERVER}/health`], ["duel-web", WEB_ORIGIN]] as const) {
    try {
      const r = await fetch(url);
      if (!r.ok) throw new Error(String(r.status));
    } catch (e) {
      throw new Error(`${name} is not running at ${url} (${e}). Start it with trailer/capture/run.sh.`);
    }
  }
}

/** Page-side CSS that only hides dev-build furniture (the version line); nothing about the product itself. */
const CAPTURE_CSS = `
  .home-version, .version-status { display: none !important; }
`;

export async function newWindow(opts: Omit<TakeOpts, "id" | "area">, world: World, errors: string[]): Promise<{ win: Win; pointer: Pointer }> {
  const spec: WindowSpec = { x: 0, y: 0, width: 1920, height: 1080, display: DISPLAY, ...opts.window };
  const win = await openWindow(spec);
  await installFakeApi(win.ctx, { ...opts.fake, world: opts.fake.world ?? world, log: (l) => errors.push(`api: ${l}`) });
  await seedProfile(win.ctx, opts.seed ?? {});
  await installCursor(win.ctx, opts.cursor ?? "arrow");
  await win.ctx.addInitScript((css: string) => {
    const add = () => {
      const el = document.createElement("style");
      el.textContent = css;
      document.documentElement.append(el);
    };
    if (document.documentElement) add();
    else document.addEventListener("DOMContentLoaded", add, { once: true });
  }, CAPTURE_CSS);
  if (opts.gameSeed !== undefined) {
    await win.ctx.route(`${GAME_SERVER}/matchmake/create/**`, (route) => {
      const body = JSON.parse(route.request().postData() ?? "{}") as object;
      return route.continue({ postData: JSON.stringify({ ...body, seed: opts.gameSeed }) });
    });
  }
  win.page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  const pointer = new Pointer(win.page, { x: spec.width * 0.72, y: spec.height * 0.78 });
  return { win, pointer };
}

export async function startTake(opts: TakeOpts): Promise<Take> {
  await checkStack();
  const errors: string[] = [];
  const world = opts.fake.world ?? new World();
  const { win, pointer } = await newWindow(opts, world, errors);
  const rec = new Recorder(opts.id, opts.area);
  return {
    id: opts.id,
    win,
    page: win.page,
    pointer,
    rec,
    world,
    errors,
    async goto(path: string) {
      await win.page.goto(path.startsWith("http") ? path : `${WEB_ORIGIN}${path}`);
    },
  };
}

/** Stop recording, close the browser, encode, grab the still. */
export async function finishTake(t: Take, extra: Win[] = [], stillAt?: number): Promise<{ path: string; seconds: number }> {
  t.rec.markOut();
  await t.rec.stop();
  for (const w of [t.win, ...extra]) await w.close();
  const out = t.rec.finish();
  still(out.path, t.id, stillAt);
  if (t.errors.length) console.log(`[${t.id}] notes:\n  ` + [...new Set(t.errors)].join("\n  "));
  console.log(`[${t.id}] ${out.seconds}s -> ${out.path}`);
  return out;
}

/** Settle: let animations that start on load finish before the first recorded frame. */
export const settle = (ms = 1200) => sleep(ms);
