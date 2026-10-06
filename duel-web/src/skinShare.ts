/**
 * The playmat / card back this seat shares with the opponent through the game
 * server. An account upload with a public path is sent as that short path (the
 * opponent's board loads it from the API); anything else is shrunk to a small
 * base64 data URL, as before.
 */
import { activePublicPath } from "./account/cosmeticsSync";
import { cardBackShareUrl } from "./cardBack";
import type { CosmeticKind } from "./net/prefsApi";
import { SKIN_MAX_CARD_BACK_CHARS, SKIN_MAX_PLAYMAT_CHARS, type SeatSkin } from "./net/protocol";
import { playmatShareUrl } from "./playmat";

export type SkinSources = {
  /** Account upload path for the image in use, or null. */
  publicPath: (kind: CosmeticKind) => string | null;
  /** Small data URL of the image in use, or null when none is set. */
  dataUrl: (kind: CosmeticKind) => Promise<string | null>;
};

const browserSources: SkinSources = {
  publicPath: activePublicPath,
  dataUrl: (kind) =>
    kind === "playmat"
      ? playmatShareUrl(SKIN_MAX_PLAYMAT_CHARS)
      : cardBackShareUrl(SKIN_MAX_CARD_BACK_CHARS),
};

export type SharedSkin = {
  skin: SeatSkin;
  /** True when a field is a public path (an older game server rejects those). */
  usesPath: boolean;
};

/**
 * Build the skin message body (null when this seat uses the default art).
 * `allowPaths: false` forces data URLs, for a game server that predates paths.
 */
export async function buildSharedSkin(
  opts: { allowPaths?: boolean } = {},
  sources: SkinSources = browserSources,
): Promise<SharedSkin | null> {
  const allowPaths = opts.allowPaths ?? true;
  let usesPath = false;
  async function one(kind: CosmeticKind): Promise<string | null> {
    const path = allowPaths ? sources.publicPath(kind) : null;
    if (path) {
      usesPath = true;
      return path;
    }
    return sources.dataUrl(kind);
  }
  const [playmat, cardBack] = await Promise.all([one("playmat"), one("cardBack")]);
  if (!playmat && !cardBack) return null;
  return { skin: { playmat, cardBack }, usesPath };
}

/** The game server's complaint about a skin field that is not a data URL (servers before public paths). */
export function isSkinPathRejected(err: { code: string; message: string }): boolean {
  return err.code === "bad_protocol" && /^(playmat|cardBack) must be a small base64 image data URL/.test(err.message);
}
