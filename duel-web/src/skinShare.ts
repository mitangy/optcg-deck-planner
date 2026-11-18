import { activePublicPath } from "./account/cosmeticsSync";
import { cardBackShareUrl } from "./cardBack";
import type { CosmeticKind } from "./net/prefsApi";
import { SKIN_MAX_CARD_BACK_CHARS, SKIN_MAX_PLAYMAT_CHARS, type SeatSkin } from "./net/protocol";
import { playmatShareUrl } from "./playmat";
import { currentSettings } from "./settings";

export type SkinSources = {
  publicPath: (kind: CosmeticKind) => string | null;
  dataUrl: (kind: CosmeticKind) => Promise<string | null>;
  donArt: () => number | null;
};

const browserSources: SkinSources = {
  publicPath: activePublicPath,
  dataUrl: (kind) =>
    kind === "playmat"
      ? playmatShareUrl(SKIN_MAX_PLAYMAT_CHARS)
      : cardBackShareUrl(SKIN_MAX_CARD_BACK_CHARS),
  donArt: () => currentSettings().donArt,
};

export type SharedSkin = {
  skin: SeatSkin;
  usesPath: boolean;
};

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
  const donArt = sources.donArt();
  if (!playmat && !cardBack && !donArt) return null;
  return { skin: { playmat, cardBack, donArt }, usesPath };
}

export function isSkinPathRejected(err: { code: string; message: string }): boolean {
  return err.code === "bad_protocol" && /^(playmat|cardBack) must be a small base64 image data URL/.test(err.message);
}
