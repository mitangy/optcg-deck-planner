/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL?: string;
  /** Duel app origin for "Play in Duel" links (default https://optcgduel.app). */
  readonly VITE_DUEL_URL?: string;
  /** Short git SHA injected at build time (see vite.config.ts). */
  readonly VITE_GIT_SHA?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
