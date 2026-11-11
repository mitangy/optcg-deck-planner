import { describe, expect, it } from "vitest";
import { formatMoney, formatMoneyCompact, formatMoneyWhole } from "./money.js";

describe("money formatting (#1223)", () => {
  it("groups thousands with commas and keeps two decimals", () => {
    expect(formatMoney(1234.5)).toBe("$1,234.50");
    expect(formatMoney(1530)).toBe("$1,530.00");
    expect(formatMoney(12.5)).toBe("$12.50");
  });

  it("whole dollars also group thousands", () => {
    expect(formatMoneyWhole(1234.56)).toBe("$1,235");
  });

  it("compact reads $2K / $1.2K from a thousand and whole dollars below", () => {
    expect(formatMoneyCompact(2000)).toBe("$2K");
    expect(formatMoneyCompact(1234)).toBe("$1.2K");
    expect(formatMoneyCompact(999.4)).toBe("$999");
  });
});
