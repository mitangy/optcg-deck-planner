import { describe, expect, it, vi } from "vitest";
import { createProductEvents, type ProductEventsEnv } from "./productEvents";

function harness(over: Partial<ProductEventsEnv> = {}, allowAutomation = false) {
  const beacons: { url: string; type: string; body: Promise<string> }[] = [];
  const fetched: string[] = [];
  let hide: () => void = () => undefined;
  let tick: () => void = () => undefined;
  const stops = { listen: vi.fn(), timer: vi.fn() };
  const env: ProductEventsEnv = {
    isAutomated: () => false,
    sendBeacon: (url, data) => {
      beacons.push({ url, type: data.type, body: data.text() });
      return true;
    },
    fetchKeepalive: (_url, body) => void fetched.push(body),
    listen: (onHide) => {
      hide = onHide;
      return stops.listen;
    },
    setInterval: (fn) => {
      tick = fn;
      return stops.timer;
    },
    ...over,
  };
  const events = createProductEvents({ app: "duel", endpoint: () => "https://api.test/events", anonId: () => "anon-visitor-0001", allowAutomation, env });
  return { events, beacons, fetched, hide: () => hide(), tick: () => tick(), stops };
}

describe("funnel event queue (#1499)", () => {
  it("sends queued events in one beacon when the page is hidden and nothing before (#1499)", async () => {
    const h = harness();
    h.events.start();
    h.events.track("home_view");
    h.events.track("game_start", { mode: "bot" });
    expect(h.beacons).toHaveLength(0);
    h.hide();
    expect(h.beacons).toHaveLength(1);
    expect(h.beacons[0]!.url).toBe("https://api.test/events");
    // text/plain keeps the browser from sending a CORS preflight a closing tab cannot wait for.
    expect(h.beacons[0]!.type).toMatch(/^text\/plain/);
    expect(JSON.parse(await h.beacons[0]!.body)).toEqual({
      app: "duel",
      anon_id: "anon-visitor-0001",
      events: [{ name: "home_view" }, { name: "game_start", props: { mode: "bot" } }],
    });
  });

  it("flushes on the interval and sends nothing when the queue is empty (#1499)", () => {
    const h = harness();
    h.events.start();
    h.tick();
    expect(h.beacons).toHaveLength(0);
    h.events.track("landing", { path: "/leaders" });
    h.tick();
    h.tick();
    expect(h.beacons).toHaveLength(1);
  });

  it("splits more than twenty events into batches the server accepts whole (#1499)", async () => {
    const h = harness();
    for (let i = 0; i < 45; i++) h.events.track("setting_changed", { key: `k${i}` });
    h.events.flush();
    const sizes = await Promise.all(h.beacons.map(async (b) => (JSON.parse(await b.body) as { events: unknown[] }).events.length));
    expect(sizes).toEqual([20, 20, 5]);
  });

  it("falls back to a keepalive fetch when the beacon is refused (#1499)", () => {
    const h = harness({ sendBeacon: () => false });
    h.events.track("home_view");
    h.events.flush();
    expect(h.fetched).toHaveLength(1);
  });

  it("records nothing in an automated browser unless the test opts in (#1499)", () => {
    const off = harness({ isAutomated: () => true });
    off.events.track("home_view");
    off.events.flush();
    expect(off.beacons).toHaveLength(0);
    const on = harness({ isAutomated: () => true }, true);
    on.events.track("home_view");
    on.events.flush();
    expect(on.beacons).toHaveLength(1);
  });

  it("stopping removes both the page-hide listener and the timer (#1499)", () => {
    const h = harness();
    h.events.start()();
    expect(h.stops.listen).toHaveBeenCalledOnce();
    expect(h.stops.timer).toHaveBeenCalledOnce();
  });
});
