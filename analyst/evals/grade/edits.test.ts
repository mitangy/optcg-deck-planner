import { describe, expect, it } from "vitest";
import { loadCatalog } from "../../src/catalog";
import { RAYLEIGH_OK } from "../cases";
import { checkEdits } from "./edits";

const catalog = loadCatalog();

describe("edit checks", () => {
  it("applies +N/-N lines and keeps a legal Rayleigh deck legal (#403)", () => {
    const r = checkEdits(catalog, RAYLEIGH_OK, "Swap them:\n-2 OP01-016\n+2 OP01-017");
    expect(r).toEqual({ applied: 2, legal: true, problems: [] });
  });

  it("applies +N/-N lines and reports a cost-5 card in a Rayleigh deck as illegal (#403)", () => {
    const r = checkEdits(catalog, RAYLEIGH_OK, "-2 OP01-016\n+2 EB01-002");
    expect(r.legal).toBe(false);
    expect(r.problems.join(" ")).toContain("EB01-002");
  });

  it("fails an answer with no +N/-N lines to apply (#403)", () => {
    expect(checkEdits(catalog, RAYLEIGH_OK, "Add some cheap cards.")).toMatchObject({ applied: 0, legal: false });
  });
});
