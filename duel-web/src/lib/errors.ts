/** The message of a thrown value, or `fallback` when it is not an `Error` (a rejected string, an aborted fetch's reason...). */
export function errorMessage(e: unknown, fallback: string): string {
  return e instanceof Error ? e.message : fallback;
}
