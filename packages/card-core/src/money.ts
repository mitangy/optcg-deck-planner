// One US-dollar display formatter for every app and package. Built once: constructing Intl.NumberFormat per call is slow.
const USD = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const USD_WHOLE = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0, maximumFractionDigits: 0 });
const USD_COMPACT = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", notation: "compact", minimumFractionDigits: 0, maximumFractionDigits: 1 });

/** "$1,234.56". Display only: input fields keep a plain `toFixed(2)` so the value round-trips through a parser. */
export function formatMoney(n: number): string {
  return USD.format(n);
}

/** "$1,235": whole dollars, for axis ticks and ranges where cents are noise. */
export function formatMoneyWhole(n: number): string {
  return USD_WHOLE.format(n);
}

/** "$2K", "$1.2K" from a thousand up; below that whole dollars ("$12"), short enough for a phone's narrow cell. */
export function formatMoneyCompact(n: number): string {
  return Math.abs(n) >= 1000 ? USD_COMPACT.format(n) : USD_WHOLE.format(n);
}
