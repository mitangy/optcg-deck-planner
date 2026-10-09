import { describe, expect, it } from "vitest";
import { modeTiles, primaryAction } from "./primaryAction";

describe("primaryAction", () => {
  it("starts the Ranked queue in one tap for a player whose last mode was Ranked (#431)", () => {
    expect(primaryAction("queue")).toEqual({ act: "start", mode: "queue", subline: "Ranked · 15 min per player" });
  });

  it("opens the setup sheet at the last mode for Practice, Private room and Spectate (#431)", () => {
    expect(primaryAction("hotseat")).toEqual({ act: "sheet", mode: "hotseat", subline: "Practice" });
    expect(primaryAction("create")).toEqual({ act: "sheet", mode: "create", subline: "Private room" });
    expect(primaryAction("spectate")).toEqual({ act: "sheet", mode: "spectate", subline: "Spectate" });
  });

  it("opens the mode chooser when there is no last mode (#431)", () => {
    expect(primaryAction(null)).toEqual({ act: "choose", mode: null, subline: "Choose a mode" });
  });

  it("lists the other modes as tiles, all four when none was used (#431)", () => {
    expect(modeTiles(null)).toEqual(["queue", "hotseat", "create", "spectate"]);
    expect(modeTiles("queue")).toEqual(["hotseat", "create", "spectate"]);
    expect(modeTiles("create")).toEqual(["queue", "hotseat", "spectate"]);
  });
});
