// Built once: constructing Intl.NumberFormat per call is slow.
const USD = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const USD_WHOLE = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0, maximumFractionDigits: 0 });
const USD_COMPACT = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", notation: "compact", minimumFractionDigits: 0, maximumFractionDigits: 1 });

/** "$1,234.56". Display only: input fields keep a plain `toFixed(2)` so the value round-trips through a parser. */
export function formatMoney(n: number): string {
  return USD.format(n);
}

export function formatMoneyWhole(n: number): string {
  return USD_WHOLE.format(n);
}

export function formatMoneyCompact(n: number): string {
  return Math.abs(n) >= 1000 ? USD_COMPACT.format(n) : USD_WHOLE.format(n);
}
