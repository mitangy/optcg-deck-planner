/**
 * Compile-time exhaustiveness check for `switch` statements over the effect DSL unions:
 * a variant the switch does not handle makes the argument non-`never` and fails `tsc`.
 * At run time (a value that slipped past validation) it throws.
 */
export function assertNever(value: never, what = "value"): never {
  throw new Error(`Unhandled ${what}: ${JSON.stringify(value)}`);
}
