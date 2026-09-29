import { useState } from "react";

/** Keep in sync with the pre-paint script in index.html. */
export const THEME_STORAGE_KEY = "optcg_theme";

export type ThemePref = "auto" | "light" | "dark";

const ORDER: ThemePref[] = ["auto", "dark", "light"];
const LABEL: Record<ThemePref, string> = {
  auto: "Theme: match system",
  dark: "Theme: dark",
  light: "Theme: light",
};

export function readThemePref(): ThemePref {
  try {
    const v = localStorage.getItem(THEME_STORAGE_KEY);
    return v === "light" || v === "dark" ? v : "auto";
  } catch {
    return "auto";
  }
}

export function applyThemePref(pref: ThemePref) {
  const root = document.documentElement;
  if (pref === "auto") delete root.dataset.theme;
  else root.dataset.theme = pref;
  try {
    if (pref === "auto") localStorage.removeItem(THEME_STORAGE_KEY);
    else localStorage.setItem(THEME_STORAGE_KEY, pref);
  } catch {
    // Private mode / blocked storage: the choice still applies for this visit.
  }
}

function ThemeIcon({ pref }: { pref: ThemePref }) {
  if (pref === "dark") {
    return (
      <svg viewBox="0 0 20 20" aria-hidden="true">
        <path d="M15.5 12.5A6.5 6.5 0 0 1 7.5 4.5a6.5 6.5 0 1 0 8 8z" fill="currentColor" />
      </svg>
    );
  }
  if (pref === "light") {
    return (
      <svg viewBox="0 0 20 20" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
        <circle cx="10" cy="10" r="3.5" fill="currentColor" />
        <path d="M10 1.8v2M10 16.2v2M1.8 10h2M16.2 10h2M4.2 4.2l1.4 1.4M14.4 14.4l1.4 1.4M4.2 15.8l1.4-1.4M14.4 5.6l1.4-1.4" />
      </svg>
    );
  }
  // Auto: half-filled disc.
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <circle cx="10" cy="10" r="6.5" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <path d="M10 3.5a6.5 6.5 0 0 1 0 13z" fill="currentColor" />
    </svg>
  );
}

/** Cycles match-system → dark → light. */
export function ThemeToggle() {
  const [pref, setPref] = useState<ThemePref>(readThemePref);
  const next = ORDER[(ORDER.indexOf(pref) + 1) % ORDER.length];
  return (
    <button
      type="button"
      className="theme-toggle"
      title={`${LABEL[pref]} (click for ${LABEL[next].replace("Theme: ", "")})`}
      aria-label={`${LABEL[pref]}. Switch to ${LABEL[next].replace("Theme: ", "")}.`}
      onClick={() => {
        applyThemePref(next);
        setPref(next);
      }}
    >
      <ThemeIcon pref={pref} />
    </button>
  );
}
