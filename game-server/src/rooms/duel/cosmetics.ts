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

/** Per-seat cosmetics (alt-art prefs, playmat / card back): stored, relayed, and filtered so no decklist leaks (#369). */
export class SeatCosmetics {
  /** Per-seat alt-art prefs (cosmetics only; not rules state). */
  private seatArtPrefs: [ArtPrefsMap, ArtPrefsMap] = [{}, {}];
  /**
   * Card defIds each seat has shown face-up this game. Only prefs for these
   * go to the other seat and spectators; the rest would name the decklist (#369).
   */
  private publicArtDefs: [Set<string>, Set<string>] = [new Set(), new Set()];
  /** What non-owners last received per seat (JSON), so only a change is pushed. */
  private sentPublicArt: [string, string] = ["{}", "{}"];
  /** Per-seat custom playmat / card back (cosmetics only). */
  private seatSkins: [SeatSkin | null, SeatSkin | null] = [null, null];

  constructor(private readonly core: Pick<DuelCore, "game" | "io" | "seats">) {}

  /** Clear what was shown face-up so a rematch starts clean (prefs and skins stay). */
  resetPerGameState() {
    this.publicArtDefs = [new Set(), new Set()];
    this.sentPublicArt = ["{}", "{}"];
  }

  /** A new game's opening table: fold what is already public into the set, and remember what non-owners hold. */
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

  /** One seat's prefs as `client` may see them: whole for the owner, public cards only for anyone else. */
  private artPrefsFor(client: Client, seat: Seat): ArtPrefsMap {
    const prefs = this.seatArtPrefs[seat];
    return this.core.seats.seatForClient(client) === seat ? prefs : visibleArtPrefs(prefs, this.publicArtDefs[seat]);
  }

  /** Push a seat's prefs to every client, each filtered for what it may see. */
  private broadcastSeatCosmetics(seat: Seat, onlyNonOwners = false) {
    this.sentPublicArt[seat] = JSON.stringify(visibleArtPrefs(this.seatArtPrefs[seat], this.publicArtDefs[seat]));
    for (const c of this.core.io.allClients()) {
      if (onlyNonOwners && this.core.seats.seatForClient(c) === seat) continue;
      const payload: WireBody<CosmeticsMessage> = { seat, artPrefs: this.artPrefsFor(c, seat) };
      this.core.io.send(c, "cosmetics", payload);
    }
  }

  /** Fold what the table just saw into the public set, and tell non-owners about newly public prefs. */
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
    // An image a moderator already took down must not be relayed again (#810).
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

  /** A moderator removed an image: blank it in this room's seats at once (#810). */
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

  /** Push stored seat cosmetics to one client (join / sync). */
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
