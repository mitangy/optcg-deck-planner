import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getTabMuteOverride, isTabSilenced, isWatchTab, othersPlaying, setTabMuteOverride, setTabSilenced, tabMuteCopy, tabSilenced } from "./tabMute";
import { playNotes, unlockAudio } from "./turnAlert";
import { playSfx } from "./sfx";

const base = { override: null, autoQuiet: true, watching: true, otherTabPlaying: true } as const;

describe("tabSilenced (#934)", () => {
  it("a manual mute wins over everything, even a tab nobody else is playing in", () => {
    expect(tabSilenced({ override: "muted", autoQuiet: false, watching: false, otherTabPlaying: false })).toBe(true);
  });

  it("a manual unmute beats the automatic quiet", () => {
    expect(tabSilenced({ ...base, override: "unmuted" })).toBe(false);
  });

  it("with no choice, a watch tab goes quiet while another tab plays", () => {
    expect(tabSilenced(base)).toBe(true);
  });

  it("with no choice, each condition alone keeps sound on", () => {
    expect(tabSilenced({ ...base, autoQuiet: false })).toBe(false);
    expect(tabSilenced({ ...base, watching: false })).toBe(false);
    expect(tabSilenced({ ...base, otherTabPlaying: false })).toBe(false);
  });
});

describe("isWatchTab (#971)", () => {
  it("a replay board is a watch tab even though it is not spectating, so another tab's match quiets it (#971)", () => {
    const watching = isWatchTab({ spectating: false, isReplay: true });
    expect(tabSilenced({ ...base, watching })).toBe(true);
  });

  it("a spectator board is a watch tab and a board you play is not", () => {
    expect(isWatchTab({ spectating: true, isReplay: false })).toBe(true);
    expect(isWatchTab({ spectating: false, isReplay: false })).toBe(false);
  });
});

describe("othersPlaying (#934)", () => {
  const now = 100_000;

  it("counts another tab heard within the window", () => {
    expect(othersPlaying(new Map([["b", now - 4000]]), "a", now, 5000)).toBe(true);
  });

  it("ignores a tab not heard from for longer than the window", () => {
    expect(othersPlaying(new Map([["b", now - 6000]]), "a", now, 5000)).toBe(false);
  });

  it("never counts this tab's own beats", () => {
    expect(othersPlaying(new Map([["a", now]]), "a", now, 5000)).toBe(false);
  });

  it("one fresh tab among stale ones is enough", () => {
    expect(othersPlaying(new Map([["b", now - 9000], ["c", now - 1000]]), "a", now, 5000)).toBe(true);
  });
});

describe("tab mute override storage (#934)", () => {
  const store = new Map<string, string>();
  beforeEach(() => {
    store.clear();
    vi.stubGlobal("sessionStorage", {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    });
  });
  afterEach(() => {
    setTabMuteOverride(null);
    vi.unstubAllGlobals();
  });

  it("keeps the choice in sessionStorage for this tab and clears it with null", () => {
    setTabMuteOverride("muted");
    expect(getTabMuteOverride()).toBe("muted");
    expect([...store.values()]).toEqual(["muted"]);
    setTabMuteOverride("unmuted");
    expect([...store.values()]).toEqual(["unmuted"]);
    setTabMuteOverride(null);
    expect(store.size).toBe(0);
  });

  it("still holds the choice when storage throws", () => {
    vi.stubGlobal("sessionStorage", {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
      removeItem: () => {
        throw new Error("blocked");
      },
    });
    setTabMuteOverride("muted");
    expect(getTabMuteOverride()).toBe("muted");
  });
});

describe("tabMuteCopy (#934)", () => {
  it("offers Mute when sound is on and Unmute when it is off, saying why when automatic", () => {
    expect(tabMuteCopy({ silenced: false, auto: false }).label).toBe("Mute this tab");
    expect(tabMuteCopy({ silenced: true, auto: false }).label).toBe("Unmute this tab");
    expect(tabMuteCopy({ silenced: true, auto: true }).title).toMatch(/another tab/);
    expect(tabMuteCopy({ silenced: true, auto: false }).title).not.toMatch(/another tab/);
  });
});

describe("the audio gate (#934)", () => {
  let oscillators = 0;
  let sources = 0;

  beforeEach(() => {
    oscillators = 0;
    sources = 0;
    const node = () => ({ connect: (n: unknown) => n, start() {}, stop() {}, gain: param(), frequency: param(), type: "", buffer: null });
    const param = () => ({ setValueAtTime() {}, exponentialRampToValueAtTime() {}, value: 0 });
    class FakeAudio {
      state = "suspended";
      currentTime = 0;
      sampleRate = 44100;
      destination = {};
      resume() {
        this.state = "running";
        return Promise.resolve();
      }
      createOscillator() {
        oscillators++;
        return node();
      }
      createGain() {
        return node();
      }
      createBiquadFilter() {
        return node();
      }
      createBuffer() {
        return { getChannelData: () => new Float32Array(4) };
      }
      createBufferSource() {
        sources++;
        return node();
      }
    }
    vi.stubGlobal("window", { AudioContext: FakeAudio });
  });
  afterEach(() => {
    setTabSilenced(false);
    vi.unstubAllGlobals();
  });

  const note = [{ freq: 440, at: 0, len: 0.1, gain: 0.1, type: "sine" as const }];

  it("plays notes while the tab is not silenced", () => {
    playNotes(note);
    expect(oscillators).toBe(1);
  });

  it("a silenced tab creates no oscillator", () => {
    setTabSilenced(true);
    expect(isTabSilenced()).toBe(true);
    playNotes(note);
    expect(oscillators).toBe(0);
  });

  it("a silenced tab plays no card-noise effect either", () => {
    playSfx(["draw"], 1_000_000);
    expect(sources).toBe(1);
    setTabSilenced(true);
    playSfx(["tuck"], 2_000_000);
    expect(sources).toBe(1);
  });

  it("a silenced tab still unlocks audio so unmuting later works on iOS", () => {
    setTabSilenced(true);
    unlockAudio();
    expect(sources).toBe(1);
  });
});
