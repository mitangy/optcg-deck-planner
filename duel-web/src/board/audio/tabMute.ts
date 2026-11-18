import { useCallback, useEffect, useMemo, useState } from "react";
import { createStore } from "../../lib/createStore";

export const DEMO_MATCH_ID = "demo-playmat";

export type TabMuteOverride = "muted" | "unmuted" | null;

const OVERRIDE_KEY = "duel.tabMute";
const CHANNEL_NAME = "optcg-duel-tabs";
export const HEARTBEAT_MS = 2000;
export const PRESENCE_TTL_MS = 5000;

export function isWatchTab(o: { spectating: boolean; isReplay: boolean }): boolean {
  return o.spectating || o.isReplay;
}

export function tabSilenced(o: {
  override: TabMuteOverride;
  autoQuiet: boolean;
  watching: boolean;
  otherTabPlaying: boolean;
}): boolean {
  if (o.override === "muted") return true;
  if (o.override === "unmuted") return false;
  return o.autoQuiet && o.watching && o.otherTabPlaying;
}

export function othersPlaying(beats: ReadonlyMap<string, number>, selfId: string, now: number, ttl: number = PRESENCE_TTL_MS): boolean {
  for (const [id, at] of beats) {
    if (id !== selfId && now - at <= ttl) return true;
  }
  return false;
}

function readOverride(): TabMuteOverride {
  try {
    const v = sessionStorage.getItem(OVERRIDE_KEY);
    return v === "muted" || v === "unmuted" ? v : null;
  } catch {
    return null;
  }
}

const overrideStore = createStore<TabMuteOverride>(readOverride());

export function getTabMuteOverride(): TabMuteOverride {
  return overrideStore.get();
}

export function setTabMuteOverride(next: TabMuteOverride): void {
  try {
    if (next) sessionStorage.setItem(OVERRIDE_KEY, next);
    else sessionStorage.removeItem(OVERRIDE_KEY);
  } catch {
    // Storage blocked: the choice lasts until reload.
  }
  overrideStore.set(next);
}

let silenced = false;

export function isTabSilenced(): boolean {
  return silenced;
}

export function setTabSilenced(value: boolean): void {
  silenced = value;
}

type Beat = { type: "beat" | "bye"; id: string };

function newTabId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return Math.random().toString(36).slice(2) + Date.now().toString(36);
  }
}

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
  silenced: boolean;
  auto: boolean;
  toggle: () => void;
};

export function useTabMuteOverride(): TabMuteOverride {
  return overrideStore.use();
}

export function useTabMute(o: { playing: boolean; watching: boolean; autoQuiet: boolean }): TabMute {
  const ov = useTabMuteOverride();
  const otherTabPlaying = useOtherTabPlaying(o.playing);
  const isSilenced = tabSilenced({ override: ov, autoQuiet: o.autoQuiet, watching: o.watching, otherTabPlaying });
  setTabSilenced(isSilenced);
  useEffect(() => {
    setTabSilenced(isSilenced);
    return () => setTabSilenced(false);
  }, [isSilenced]);
  const toggle = useCallback(() => setTabMuteOverride(isSilenced ? "unmuted" : "muted"), [isSilenced]);
  return { silenced: isSilenced, auto: isSilenced && ov == null, toggle };
}

export function tabMuteCopy(m: Pick<TabMute, "silenced" | "auto">): { label: string; title: string } {
  if (!m.silenced) return { label: "Mute this tab", title: "Silence the sounds in this tab" };
  return {
    label: "Unmute this tab",
    title: m.auto ? "Muted while you play in another tab. Click to unmute." : "Sound is off in this tab. Click to unmute.",
  };
}
