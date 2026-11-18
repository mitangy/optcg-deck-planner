export type ThemeId =
  | "nightSea"
  | "strawHat"
  | "donquixote"
  | "marines"
  | "wano"
  | "heart"
  | "fishMan"
  | "thrillerBark"
  | "disco";

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
  { id: "disco", name: "D$ Disco", blurb: "Mirror-ball magenta and cyan spotlights on the Sabaody auction stage." },
];

export const THEME_IDS: readonly ThemeId[] = THEMES.map((t) => t.id);

export type ColorMode = "dark" | "light" | "system";

export const COLOR_MODES: readonly ColorMode[] = ["dark", "light", "system"];

export const LIGHT_QUERY = "(prefers-color-scheme: light)";

export function resolveMode(mode: ColorMode, deviceLight: boolean): "dark" | "light" {
  if (mode === "system") return deviceLight ? "light" : "dark";
  return mode;
}

export type ThemeTarget = {
  root: { dataset: DOMStringMap };
  deviceLight(): boolean;
  themeColorMeta: { setAttribute(name: string, value: string): void } | null;
  background(): string;
};

/**
 * Set the page theme and mode and tint the browser / iOS status bar to match its
 * background, so the Home Screen app's bar never shows the old colour.
 */
export function applyTheme(
  id: ThemeId,
  mode: ColorMode = "dark",
  target: ThemeTarget = documentTarget(),
): void {
  if (id === DEFAULT_THEME) delete target.root.dataset.theme;
  else target.root.dataset.theme = id;
  if (resolveMode(mode, target.deviceLight()) === "light") target.root.dataset.mode = "light";
  else delete target.root.dataset.mode;
  const bg = target.background().trim();
  if (bg) target.themeColorMeta?.setAttribute("content", bg);
}

function documentTarget(): ThemeTarget {
  const root = document.documentElement;
  return {
    root,
    deviceLight: () => window.matchMedia?.(LIGHT_QUERY).matches === true,
    themeColorMeta: document.querySelector('meta[name="theme-color"]'),
    background: () => getComputedStyle(root).getPropertyValue("--arena-deep"),
  };
}
