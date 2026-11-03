export type VercelRoute = { src?: string; dest?: string; status?: number; handle?: string };
export function resolveRequest(
  routes: readonly VercelRoute[],
  files: ReadonlySet<string>,
  rawPath: string,
  opts?: { directoryIndex?: boolean },
): { file: string | null; status: number; via: "filesystem" | "route" | "none"; src?: string };
