import { describe, expect, it } from "vitest";
import { parsePreviewText } from "./previewText";

describe("card preview keyword tags (#348)", () => {
  it("turns a leading [On Play] into a timing chip followed by the text (#348)", () => {
    expect(parsePreviewText("[On Play] Draw 1 card.")).toEqual([
      { type: "chip", kind: "timing", text: "On Play" },
      { type: "text", text: " Draw 1 card." },
    ]);
  });

  it("leaves text without brackets as one plain segment (#348)", () => {
    expect(parsePreviewText("Draw 1 card.")).toEqual([{ type: "text", text: "Draw 1 card." }]);
  });

  it("colours [DON!! x1], [Counter], [Trigger], [Once Per Turn] and [Blocker] by kind (#348)", () => {
    const kinds = (s: string) =>
      parsePreviewText(s).flatMap((p) => (p.type === "chip" ? [p.kind] : []));
    expect(kinds("[DON!! x1] [Counter] [Trigger] [Once Per Turn] [Blocker]")).toEqual([
      "don",
      "counter",
      "trigger",
      "once",
      "keyword",
    ]);
  });

  it("keeps an unknown bracket such as a card name as plain text (#348)", () => {
    expect(parsePreviewText("Play [Monkey.D.Luffy] from your hand.")).toEqual([
      { type: "text", text: "Play [Monkey.D.Luffy] from your hand." },
    ]);
  });

  it("chips a bare DON!! −2 cost and keeps newlines in the text (#348)", () => {
    expect(parsePreviewText("Cost. [Activate: Main] DON!! −2 Draw.\nNext")).toEqual([
      { type: "text", text: "Cost. " },
      { type: "chip", kind: "timing", text: "Activate: Main" },
      { type: "text", text: " " },
      { type: "chip", kind: "don", text: "DON!! −2" },
      { type: "text", text: " Draw.\nNext" },
    ]);
  });
});
