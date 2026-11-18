import { describe, expect, it } from "vitest";
import { primaryAction } from "./primaryAction";

describe("primaryAction (#1343)", () => {
  it("with no history, a guest plays vs Bot and a signed-in player plays Ranked (#1343)", () => {
    expect(primaryAction(null, false)).toEqual({ mode: "bot", act: "sheet", title: "Play vs Bot", subline: "Casual, vs computer" });
    expect(primaryAction(null, true)).toMatchObject({ mode: "queue", act: "sheet", title: "Play Ranked" });
  });

  it("repeats the last mode and says it was last played (#1343)", () => {
    expect(primaryAction("hotseat", false)).toMatchObject({ mode: "hotseat", title: "Practice", subline: "Last played" });
    expect(primaryAction("create", true)).toMatchObject({ mode: "create", title: "Private room", subline: "Last played" });
    expect(primaryAction("bot", true)).toMatchObject({ mode: "bot", subline: "Last played" });
  });

  it("starts the Ranked queue in one tap only when Ranked was played before (#431, #1343)", () => {
    expect(primaryAction("queue", true)).toMatchObject({ mode: "queue", act: "start", subline: "Last played" });
  });

  it("falls back to Play vs Bot when Ranked was last played but the player is signed out (#1343)", () => {
    expect(primaryAction("queue", false)).toMatchObject({ mode: "bot", act: "sheet", subline: "Casual, vs computer" });
  });
});
