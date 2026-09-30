/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_GAME_SERVER_URL?: string;
  readonly VITE_API_URL?: string;
  readonly VITE_DEV_JOIN_SECRET?: string;
  /** Deck planner origin for the lobby link (default https://optcg-deck-planner.app). */
  readonly VITE_PLANNER_URL?: string;
  /** Short git SHA injected at build time (see vite.config.ts). */
  readonly VITE_GIT_SHA?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
