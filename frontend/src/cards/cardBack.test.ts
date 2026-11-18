import { describe, expect, it } from "vitest";
import { cardBackState, readCardBack } from "./cardBack";

describe("card page back link", () => {
  it("labels the page the card was opened from, keeping its query (#1342)", () => {
    expect(cardBackState({ pathname: "/", search: "" })?.from).toEqual({ to: "/", label: "Shopping" });
    expect(cardBackState({ pathname: "/meta", search: "?leader=OP01-001&days=30" })?.from).toEqual({ to: "/meta?leader=OP01-001&days=30", label: "Meta decks" });
  });

  it("names a deck page by its deck (#1342)", () => {
    expect(cardBackState({ pathname: "/decks/7" }, "Xebec tempo")?.from).toEqual({ to: "/decks/7", label: "Xebec tempo" });
    expect(cardBackState({ pathname: "/decks/7" }, "  ")?.from.label).toBe("Deck");
  });

  it("gives no way back from another card page or an unknown page (#1342)", () => {
    expect(cardBackState({ pathname: "/cards/OP01-001" })).toBeUndefined();
    expect(cardBackState({ pathname: "/import" })).toBeUndefined();
  });

  it("ignores state that is not an in-app path (#1342)", () => {
    expect(readCardBack({ from: { to: "/decks", label: "Decks" } })).toEqual({ to: "/decks", label: "Decks" });
    expect(readCardBack({ from: { to: "https://evil.example", label: "x" } })).toBeNull();
    expect(readCardBack({ from: { to: "//evil.example", label: "x" } })).toBeNull();
    expect(readCardBack(null)).toBeNull();
  });
});
