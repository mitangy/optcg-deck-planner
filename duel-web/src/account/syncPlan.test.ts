import { describe, expect, it } from "vitest";
import { planCosmeticSync } from "./syncPlan";

describe("planCosmeticSync", () => {
  it("adopts a signed-out upload when the account has no image yet", () => {
    expect(planCosmeticSync({ hasImage: true, accountId: null }, null)).toEqual({
      upload: "activate",
      apply: null,
    });
  });

  it("clears an account image this browser had after the account went back to default", () => {
    expect(planCosmeticSync({ hasImage: true, accountId: 7 }, null)).toEqual({
      upload: null,
      apply: "clear",
    });
  });

  it("downloads the account's choice when this browser has another one", () => {
    expect(planCosmeticSync({ hasImage: true, accountId: 7 }, 9)).toEqual({
      upload: null,
      apply: { download: 9 },
    });
    expect(planCosmeticSync({ hasImage: false, accountId: null }, 9)).toEqual({
      upload: null,
      apply: { download: 9 },
    });
  });

  it("keeps a signed-out upload in history without replacing the account's choice", () => {
    expect(planCosmeticSync({ hasImage: true, accountId: null }, 9)).toEqual({
      upload: "history",
      apply: { download: 9 },
    });
  });

  it("does nothing when this browser already shows the account's choice", () => {
    expect(planCosmeticSync({ hasImage: true, accountId: 9 }, 9)).toEqual({
      upload: null,
      apply: null,
    });
  });
});
