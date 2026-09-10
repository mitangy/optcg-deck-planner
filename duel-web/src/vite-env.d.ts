/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_GAME_SERVER_URL?: string;
  readonly VITE_API_URL?: string;
  readonly VITE_DEV_JOIN_SECRET?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
