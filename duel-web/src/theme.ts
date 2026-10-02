/**
 * Colour themes based on One Piece crews and places. The palettes live in
 * themes.css under [data-theme]; this module names them for the Settings
 * picker and applies the chosen one to the page.
 */

export type ThemeId =
  | "nightSea"
  | "strawHat"
  | "donquixote"
  | "marines"
  | "wano"
  | "heart"
  | "fishMan"
  | "thrillerBark";

export const DEFAULT_THEME: ThemeId = "nightSea";

export const THEMES: readonly { id: ThemeId; name: string; blurb: string }[] = [
  { id: "nightSea", name: "Night Sea", blurb: "The original: moonlit sea and straw-hat gold." },
  { id: "strawHat", name: "Straw Hat Pirates", blurb: "Straw gold and Luffy's red on Sunny's deck." },
  { id: "donquixote", name: "Donquixote Pirates", blurb: "Doflamingo's pink feather coat over Dressrosa nights." },
  { id: "marines", name: "Marines", blurb: "The white Justice coat on Navy blue." },
  { id: "wano", name: "Wano Country", blurb: "Vermilion torii, gold leaf and sakura on sumi ink." },
  { id: "heart", name: "Heart Pirates", blurb: "The Polar Tang's yellow hull on Law's black." },
  { id: "fishMan", name: "Fish-Man Island", blurb: "Coral reef in the deep sea's glow." },
  { id: "thrillerBark", name: "Thriller Bark", blurb: "Haunted purple fog and ghostly green." },
];

export const THEME_IDS: readonly ThemeId[] = THEMES.map((t) => t.id);

/** The bits of the page applyTheme touches, so tests can pass stand-ins. */
export type ThemeTarget = {
  root: { dataset: DOMStringMap };
  themeColorMeta: { setAttribute(name: string, value: string): void } | null;
  /** Resolved background colour (--arena-deep) once the theme is set. */
  background(): string;
};

/**
 * Set the page theme and tint the browser / iOS status bar to match its
 * background, so the Home Screen app's bar never shows the old colour.
 */
export function applyTheme(id: ThemeId, target: ThemeTarget = documentTarget()): void {
  if (id === DEFAULT_THEME) delete target.root.dataset.theme;
  else target.root.dataset.theme = id;
  const bg = target.background().trim();
  if (bg) target.themeColorMeta?.setAttribute("content", bg);
}

function documentTarget(): ThemeTarget {
  const root = document.documentElement;
  return {
    root,
    themeColorMeta: document.querySelector('meta[name="theme-color"]'),
    background: () => getComputedStyle(root).getPropertyValue("--arena-deep"),
  };
}
