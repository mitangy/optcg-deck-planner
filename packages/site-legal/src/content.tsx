export const DISCORD_INVITE_URL = "https://discord.gg/XYweKSE3zG";

export const LEGAL_DRAFT = true;

export const LEGAL_UPDATED = "6 October 2026";

export const LEGAL_CONTACT_EMAIL = "optcgduel@gmail.com";

export type LegalKind = "terms" | "privacy" | "cookies" | "conduct";

export const LEGAL_PATHS: Record<LegalKind, string> = {
  terms: "/terms",
  privacy: "/privacy",
  cookies: "/cookies",
  conduct: "/conduct",
};

export const LEGAL_TITLES: Record<LegalKind, string> = {
  terms: "Terms & credits",
  privacy: "Privacy policy",
  cookies: "Cookies",
  conduct: "Rules of conduct",
};

export const FAN_DISCLAIMER =
  "Unofficial fan-made project, not affiliated with or endorsed by Bandai.";

export const OWNERSHIP_NOTICE =
  "“One Piece Card Game” © Bandai Co., Ltd. “One Piece” © Eiichiro Oda / Shueisha, Toei Animation. " +
  "All trademarks, card images and game content belong to their respective owners and are used " +
  "for informational and community purposes.";
