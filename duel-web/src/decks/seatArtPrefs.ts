import { getArtPrefs, getSelectedDeck } from "./storage";

export type ArtPrefsMap = Record<string, string>;
export type Seat = 0 | 1;

type CosmeticsPublisher = (seat: Seat, prefs: ArtPrefsMap) => void;

let maps: [ArtPrefsMap, ArtPrefsMap] = [{}, {}];
let live: [boolean, boolean] = [false, false];
let tick = 0;
const listeners = new Set<() => void>();
let cosmeticsPublisher: CosmeticsPublisher | null = null;

function emit() {
  tick += 1;
  for (const listener of listeners) listener();
}

export function getArtPrefsTick(): number {
  return tick;
}

export function subscribeArtPrefs(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function setCosmeticsPublisher(publisher: CosmeticsPublisher | null) {
  cosmeticsPublisher = publisher;
}

export function getSeatArtPrefs(seat: Seat): ArtPrefsMap {
  return maps[seat];
}

export function isSeatArtPrefsLive(seat: Seat): boolean {
  return live[seat];
}

export function getSeatArtPref(seat: Seat, defId: string): string | undefined {
  return maps[seat][defId];
}

export function setSeatArtPref(seat: Seat, defId: string, altId: string | null) {
  const next = { ...maps[seat] };
  if (!altId) delete next[defId];
  else next[defId] = altId;
  maps[seat] = next;
  live[seat] = true;
  emit();
  cosmeticsPublisher?.(seat, next);
}

export function replaceSeatArtPrefs(seat: Seat, prefs: ArtPrefsMap) {
  maps[seat] = { ...prefs };
  live[seat] = true;
  emit();
}

export function initSeatArtPrefsFromStorage(seat: Seat) {
  const deck = getSelectedDeck();
  const global = getArtPrefs();
  maps[seat] = { ...global, ...(deck?.artPrefs ?? {}) };
  live[seat] = true;
  emit();
  cosmeticsPublisher?.(seat, maps[seat]);
}

export function resetAllSeatArtPrefs() {
  maps = [{}, {}];
  live = [false, false];
  emit();
}

export function _resetSeatArtPrefsForTests() {
  maps = [{}, {}];
  live = [false, false];
  tick = 0;
  listeners.clear();
  cosmeticsPublisher = null;
}
