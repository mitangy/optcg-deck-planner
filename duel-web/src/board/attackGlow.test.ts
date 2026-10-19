import { describe, expect, it } from "vitest";
import { lookupCard } from "../cards/atlas";
import { attackReadyClass } from "./attackGlow";

describe("attackReadyClass", () => {
  it("uses the light ring on Green and Green-pair cards, the green ring elsewhere (#449)", () => {
    expect(attackReadyClass(["green"])).toBe("attack-ready attack-ready-light");
    expect(attackReadyClass(["purple", "green"])).toBe("attack-ready attack-ready-light");
    expect(attackReadyClass(["red"])).toBe("attack-ready");
    expect(attackReadyClass(["red", "blue"])).toBe("attack-ready");
    expect(attackReadyClass([])).toBe("attack-ready");
  });

  it("reads the catalog colours of a real Green and a real Red card (#449)", () => {
    expect(attackReadyClass(lookupCard("ST02-001").colors)).toContain("attack-ready-light");
    expect(attackReadyClass(lookupCard("ST01-001").colors)).toBe("attack-ready");
  });
});
