import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";

/**
 * Per-tab sound control (#934). Spectating one game while dueling in another
 * tab makes the effects confusing, so a tab can be silenced by hand ("Mute this
 * tab") or automatically: a watch tab (spectator or replay) stays quiet while
 * another tab of this browser has a live match open as a player. The audio code
 * (`playNotes`, `noiseBurst`) reads `isTabSilenced()`; the board keeps it current.
 */

/** The /demo board's match id: a demo is not a match anyone is playing. */
export const DEMO_MATCH_ID = "demo-playmat";

export type TabMuteOverride = "muted" | "unmuted" | null;

const OVERRIDE_KEY = "duel.tabMute";
const CHANNEL_NAME = "optcg-duel-tabs";
/** How often a playing tab says it is still there. */
export const HEARTBEAT_MS = 2000;
/** A tab not heard from for this long is gone (a crashed or frozen tab sends no bye). */
export const PRESENCE_TTL_MS = 5000;

/** The tab's silenced state, resolved from the manual override and the cross-tab presence. */
export function tabSilenced(o: {
  override: TabMuteOverride;
  /** The "Quiet watch tabs" setting. */
  autoQuiet: boolean;
  /** This tab is spectating or replaying. */
  watching: boolean;
  otherTabPlaying: boolean;
}): boolean {
  if (o.override === "muted") return true;
  if (o.override === "unmuted") return false;
  return o.autoQuiet && o.watching && o.otherTabPlaying;
}

/** Whether any tab other than `selfId` sent a heartbeat within `ttl` ms of `now`. */
export function othersPlaying(beats: ReadonlyMap<string, number>, selfId: string, now: number, ttl: number = PRESENCE_TTL_MS): boolean {
  for (const [id, at] of beats) {
    if (id !== selfId && now - at <= ttl) return true;
  }
  return false;
}

// —— Manual override, kept in sessionStorage so it belongs to this tab and survives a reload ——

function readOverride(): TabMuteOverride {
  try {
    const v = sessionStorage.getItem(OVERRIDE_KEY);
    return v === "muted" || v === "unmuted" ? v : null;
  } catch {
    return null;
  }
}

let override: TabMuteOverride = readOverride();
const overrideListeners = new Set<() => void>();

export function getTabMuteOverride(): TabMuteOverride {
  return override;
}

export function setTabMuteOverride(next: TabMuteOverride): void {
  override = next;
  try {
    if (next) sessionStorage.setItem(OVERRIDE_KEY, next);
    else sessionStorage.removeItem(OVERRIDE_KEY);
  } catch {
    // Storage blocked: the choice lasts until the page is reloaded.
  }
  overrideListeners.forEach((l) => l());
}

function subscribeOverride(listener: () => void): () => void {
  overrideListeners.add(listener);
  return () => void overrideListeners.delete(listener);
}

// —— The gate the audio code reads ——

let silenced = false;

export function isTabSilenced(): boolean {
  return silenced;
}

export function setTabSilenced(value: boolean): void {
  silenced = value;
}

// —— Cross-tab presence ——

type Beat = { type: "beat" | "bye"; id: string };

function newTabId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return Math.random().toString(36).slice(2) + Date.now().toString(36);
  }
}

/**
 * Listens for other tabs' heartbeats, and sends its own while `playing` (a live
 * match as a player). Returns whether another tab is playing right now.
 */
export function useOtherTabPlaying(playing: boolean): boolean {
  const selfId = useMemo(newTabId, []);
  const [other, setOther] = useState(false);

  useEffect(() => {
    if (typeof BroadcastChannel === "undefined") return;
    let channel: BroadcastChannel;
    try {
      channel = new BroadcastChannel(CHANNEL_NAME);
    } catch {
      return;
    }
    const beats = new Map<string, number>();
    const refresh = () => {
      const now = Date.now();
      for (const [id, at] of beats) if (now - at > PRESENCE_TTL_MS) beats.delete(id);
      setOther(othersPlaying(beats, selfId, now));
    };
    channel.onmessage = (e: MessageEvent<Beat>) => {
      const m = e.data;
      if (!m || typeof m.id !== "string" || m.id === selfId) return;
      if (m.type === "bye") beats.delete(m.id);
      else if (m.type === "beat") beats.set(m.id, Date.now());
      else return;
      refresh();
    };
    const send = (type: Beat["type"]) => {
      try {
        channel.postMessage({ type, id: selfId } satisfies Beat);
      } catch {
        // Channel closed.
      }
    };
    if (playing) send("beat");
    const timer = window.setInterval(() => {
      if (playing) send("beat");
      refresh();
    }, HEARTBEAT_MS);
    const onHide = () => {
      if (playing) send("bye");
    };
    window.addEventListener("pagehide", onHide);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("pagehide", onHide);
      if (playing) send("bye");
      channel.close();
      setOther(false);
    };
  }, [playing, selfId]);

  return other;
}

export type TabMute = {
  /** Sound is off in this tab right now, by hand or automatically. */
  silenced: boolean;
  /** Silenced only because another tab is playing (no manual choice). */
  auto: boolean;
  /** Flips the effective state and remembers it for this tab. */
  toggle: () => void;
};

/** The manual override, as a store. */
export function useTabMuteOverride(): TabMuteOverride {
  return useSyncExternalStore(subscribeOverride, getTabMuteOverride, getTabMuteOverride);
}

/**
 * The board's tab-mute state; also keeps the audio gate current. Call it once per board.
 * `playing`: a live match as a player in this tab. `watching`: a spectator or replay.
 */
export function useTabMute(o: { playing: boolean; watching: boolean; autoQuiet: boolean }): TabMute {
  const ov = useTabMuteOverride();
  const otherTabPlaying = useOtherTabPlaying(o.playing);
  const isSilenced = tabSilenced({ override: ov, autoQuiet: o.autoQuiet, watching: o.watching, otherTabPlaying });
  // Set during render too, so a cue fired by this render's effects already sees it.
  setTabSilenced(isSilenced);
  useEffect(() => {
    setTabSilenced(isSilenced);
    return () => setTabSilenced(false);
  }, [isSilenced]);
  const toggle = useCallback(() => setTabMuteOverride(isSilenced ? "unmuted" : "muted"), [isSilenced]);
  return { silenced: isSilenced, auto: isSilenced && ov == null, toggle };
}

/** Button copy for the current state. */
export function tabMuteCopy(m: Pick<TabMute, "silenced" | "auto">): { label: string; title: string } {
  if (!m.silenced) return { label: "Mute this tab", title: "Silence the sounds in this tab" };
  return {
    label: "Unmute this tab",
    title: m.auto ? "Muted while you play in another tab. Click to unmute." : "Sound is off in this tab. Click to unmute.",
  };
}
