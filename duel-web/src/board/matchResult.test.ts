import { describe, expect, it } from "vitest";
import { describeMatchResult, endReasonLabel } from "./matchResult";

describe("endReasonLabel", () => {
  it("maps every engine + room reason to readable text", () => {
    expect(endReasonLabel("leader_battle_at_zero_life")).toBe("Leader took damage with 0 Life");
    expect(endReasonLabel("deck_out")).toBe("Deck out");
    expect(endReasonLabel("card_effect")).toBe("Won by a card effect");
    expect(endReasonLabel("concede")).toBe("Concession");
    expect(endReasonLabel("match_timeout")).toBe("Match clock ran out");
    expect(endReasonLabel("opponent_disconnected")).toBe("Opponent disconnected");
    expect(endReasonLabel("unknown")).toBe("Match ended");
    expect(endReasonLabel(null)).toBe("Match ended");
  });

  it("humanizes unexpected reasons instead of showing raw enums", () => {
    expect(endReasonLabel("some_new_reason")).toBe("Some new reason");
  });
});

describe("describeMatchResult", () => {
  it("speaks from the winner's perspective", () => {
    const r = describeMatchResult({ winner: 0, reason: "leader_battle_at_zero_life", youSeat: 0 });
    expect(r.outcome).toBe("win");
    expect(r.text).toBe("You won — Your opponent's Leader took damage with 0 Life");
  });

  it("speaks from the loser's perspective", () => {
    const r = describeMatchResult({ winner: 1, reason: "leader_battle_at_zero_life", youSeat: 0 });
    expect(r.outcome).toBe("loss");
    expect(r.text).toBe("You lost — Your Leader took damage with 0 Life");
  });

  it("covers deck out, concession, clock and card effects", () => {
    expect(describeMatchResult({ winner: 1, reason: "deck_out", youSeat: 0 }).text).toBe(
      "You lost — Your deck ran out of cards",
    );
    expect(describeMatchResult({ winner: 0, reason: "concede", youSeat: 0 }).text).toBe(
      "You won — Your opponent conceded",
    );
    expect(describeMatchResult({ winner: 1, reason: "concede", youSeat: 0 }).text).toBe(
      "You lost — You conceded",
    );
    expect(describeMatchResult({ winner: 0, reason: "match_timeout", youSeat: 0 }).text).toBe(
      "You won — The match clock ran out on your opponent",
    );
    expect(describeMatchResult({ winner: 0, reason: "card_effect", youSeat: 0 }).text).toBe(
      "You won — Your card effect won the game",
    );
  });

  it("names seats for spectators and hotseat", () => {
    expect(describeMatchResult({ winner: 1, reason: "deck_out", youSeat: null }).text).toBe(
      "Seat 1 wins — Seat 0's deck ran out of cards",
    );
    const hot = describeMatchResult({ winner: 0, reason: "concede", youSeat: 1, neutral: true });
    expect(hot.outcome).toBe("neutral");
    expect(hot.text).toBe("Seat 0 wins — Seat 1 conceded");
  });

  it("never shows raw reason strings", () => {
    const r = describeMatchResult({ winner: 0, reason: "unknown", youSeat: 0 });
    expect(r.text).toBe("You won — The match has ended");
    expect(describeMatchResult({ winner: 0, reason: "weird_reason", youSeat: 0 }).detail).toBe("Weird reason");
  });
});
