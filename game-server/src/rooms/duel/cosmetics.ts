import type { Client } from "colyseus";
import type { GameEvent, Seat } from "@optcg/rules";
import { collectPublicDefIds, visibleArtPrefs } from "../../publicArt.js";
import type { Takedown } from "../../presence.js";
import { cosmeticIdOfLink, isTakenDown, skinMatchesTakedown } from "../../takedowns.js";
import {
  parseCosmeticsMessage,
  parseSkinMessage,
  type ArtPrefsMap,
  type CosmeticsMessage,
  type SeatSkin,
  type SkinMessage,
} from "../../protocol.js";
import type { DuelCore, WireBody } from "./context.js";

export class SeatCosmetics {
  private seatArtPrefs: [ArtPrefsMap, ArtPrefsMap] = [{}, {}];
  /** Only prefs for these go to the other seat and spectators; the rest would name the decklist. */
  private publicArtDefs: [Set<string>, Set<string>] = [new Set(), new Set()];
  private sentPublicArt: [string, string] = ["{}", "{}"];
  private seatSkins: [SeatSkin | null, SeatSkin | null] = [null, null];

  constructor(private readonly core: Pick<DuelCore, "game" | "io" | "seats">) {}

  resetPerGameState() {
    this.publicArtDefs = [new Set(), new Set()];
    this.sentPublicArt = ["{}", "{}"];
  }

  startGame() {
    const match = this.core.game.match!;
    for (const seat of [0, 1] as Seat[]) {
      collectPublicDefIds(match, seat, [], this.publicArtDefs[seat]);
      this.sentPublicArt[seat] = JSON.stringify(visibleArtPrefs(this.seatArtPrefs[seat], this.publicArtDefs[seat]));
    }
  }

  handleCosmetics(client: Client, seat: Seat, message: unknown) {
    let artPrefs: ArtPrefsMap;
    try {
      artPrefs = parseCosmeticsMessage(message);
    } catch (e) {
      this.core.io.sendParseError(client, e);
      return;
    }
    this.seatArtPrefs[seat] = artPrefs;
    // The sender gets its full map back; everyone else only the cards already public.
    this.broadcastSeatCosmetics(seat);
  }

  private artPrefsFor(client: Client, seat: Seat): ArtPrefsMap {
    const prefs = this.seatArtPrefs[seat];
    return this.core.seats.seatForClient(client) === seat ? prefs : visibleArtPrefs(prefs, this.publicArtDefs[seat]);
  }

  private broadcastSeatCosmetics(seat: Seat, onlyNonOwners = false) {
    this.sentPublicArt[seat] = JSON.stringify(visibleArtPrefs(this.seatArtPrefs[seat], this.publicArtDefs[seat]));
    for (const c of this.core.io.allClients()) {
      if (onlyNonOwners && this.core.seats.seatForClient(c) === seat) continue;
      const payload: WireBody<CosmeticsMessage> = { seat, artPrefs: this.artPrefsFor(c, seat) };
      this.core.io.send(c, "cosmetics", payload);
    }
  }

  updatePublicArt(events: GameEvent[]) {
    const match = this.core.game.match;
    if (!match) return;
    for (const seat of [0, 1] as Seat[]) {
      collectPublicDefIds(match, seat, events, this.publicArtDefs[seat]);
      const key = JSON.stringify(visibleArtPrefs(this.seatArtPrefs[seat], this.publicArtDefs[seat]));
      if (key !== this.sentPublicArt[seat]) this.broadcastSeatCosmetics(seat, true);
    }
  }

  handleSkin(client: Client, seat: Seat, message: unknown) {
    let skin: SeatSkin;
    try {
      skin = parseSkinMessage(message);
    } catch (e) {
      this.core.io.sendParseError(client, e);
      return;
    }
    // An image a moderator already took down must not be relayed again.
    const blocked = (v: string | null) => {
      const id = cosmeticIdOfLink(v);
      return id !== null && isTakenDown(id);
    };
    if (blocked(skin.playmat)) skin = { ...skin, playmat: null };
    if (blocked(skin.cardBack)) skin = { ...skin, cardBack: null };
    this.seatSkins[seat] = skin;
    const payload: WireBody<SkinMessage> = { seat, skin };
    this.core.io.broadcast("skin", payload);
  }

  applyTakedowns(list: readonly Takedown[]) {
    for (const t of list) {
      for (const seat of [0, 1] as Seat[]) {
        const skin = this.seatSkins[seat];
        if (!skin || this.core.seats.slot(seat)?.userId !== t.user_id) continue;
        if (!skinMatchesTakedown(skin[t.kind], t.cosmetic_id)) continue;
        const next: SeatSkin = { ...skin, [t.kind]: null };
        this.seatSkins[seat] = next;
        const payload: WireBody<SkinMessage> = { seat, skin: next };
        this.core.io.broadcast("skin", payload);
      }
    }
  }

  sendStored(client: Client) {
    for (const seat of [0, 1] as Seat[]) {
      const artPrefs = this.artPrefsFor(client, seat);
      if (Object.keys(artPrefs).length === 0) continue;
      const payload: WireBody<CosmeticsMessage> = {
        seat,
        artPrefs,
      };
      this.core.io.send(client, "cosmetics", payload);
    }
    for (const seat of [0, 1] as Seat[]) {
      const skin = this.seatSkins[seat];
      if (!skin) continue;
      const payload: WireBody<SkinMessage> = { seat, skin };
      this.core.io.send(client, "skin", payload);
    }
  }
}
