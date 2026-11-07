/// <reference types="vite/client" />

// Baked in by the apps' Vite config (`resolveGitSha` and `versionFile` in tools/vite/versionFile.mjs).
interface ImportMetaEnv {
  readonly VITE_GIT_SHA?: string;
  readonly VITE_BUILD_TIME?: string;
}
