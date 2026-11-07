import type { Plugin } from "vite";

export function resolveGitSha(): string;
export function versionFile(name: string, sha: string, builtAt: string): Plugin;
