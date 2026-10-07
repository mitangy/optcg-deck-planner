import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CitedAnswer, Markdown, messageContext, parseSource, type PlacedCitation } from "@optcg/analyst-client";
import { HintActions } from "@optcg/deck-analytics/ui";
import { deckContext, reviewMode, showsLogPose, sourceHref } from "./logPose";

describe("Log Pose compass placement (#377)", () => {
  it("stays off every route that renders a board (#377)", () => {
    for (const path of ["/duel", "/hotseat", "/demo", "/watch/abc123"]) expect(showsLogPose(path), path).toBe(false);
  });

  it("shows on the lobby, decks, deck editor, settings, history and legal pages (#377)", () => {
    for (const path of ["/", "/decks", "/decks/abc/configure", "/settings", "/history", "/history/m1", "/terms"]) {
      expect(showsLogPose(path), path).toBe(true);
    }
  });
});

describe("Log Pose page context (#377)", () => {
  it("sends the deck being edited as one entry per card with its copies (#377)", () => {
    const ctx = deckContext({ name: "Enel", leaderId: "OP05-098", cards: ["OP05-100", "OP05-100", "OP05-101", "OP05-100"] });
    expect(ctx).toEqual({
      name: "Enel",
      leaderId: "OP05-098",
      cards: [
        { id: "OP05-100", copies: 3 },
        { id: "OP05-101", copies: 1 },
      ],
    });
  });

  it("leaves the deck out of the next message after the chip's × is pressed, keeping the page id (#377)", () => {
    const page = { page: "deck-editor", label: "Enel", deck: deckContext({ name: "Enel", leaderId: "OP05-098", cards: ["OP05-100"] }) };
    expect(messageContext(page, false)).toEqual({ page: "deck-editor", deck: page.deck });
    expect(messageContext(page, true)).toEqual({ page: "deck-editor" });
  });
});

describe("Why? on a build hint (#399)", () => {
  const actions = (onAsk?: () => void) => renderToStaticMarkup(<HintActions dismissed={false} onDismiss={() => {}} onRestore={() => {}} onAsk={onAsk} />);

  it("shows Why? in a hint's popover only when Log Pose can answer (#399)", () => {
    expect(actions()).not.toContain("Ask Log Pose");
    expect(actions()).toContain("Dismiss");
    const withAsk = actions(() => {});
    expect(withAsk).toContain("Why? Ask Log Pose");
    expect(withAsk.indexOf("Why? Ask Log Pose")).toBeLessThan(withAsk.indexOf("Dismiss"));
  });

  it("tells Log Pose the planner deck a duel deck is linked to (#399)", () => {
    expect(deckContext({ name: "Enel", leaderId: "OP05-098", cards: ["OP05-100"], plannerDeckId: 42 }).plannerDeckId).toBe(42);
    expect(deckContext({ name: "Enel", leaderId: "OP05-098", cards: ["OP05-100"] })).not.toHaveProperty("plannerDeckId");
  });
});

describe("post-game review on the match log (#377)", () => {
  it("never generates a review for a game that was cut off (#377)", () => {
    expect(reviewMode(true, false)).toBe("cut-off");
    expect(reviewMode(true, true)).toBe("auto");
    expect(reviewMode(true, undefined)).toBe("auto");
  });

  it("shows nothing while chat is off or unknown (#377)", () => {
    expect(reviewMode(false, true)).toBe("hidden");
    expect(reviewMode(null, true)).toBe("hidden");
  });
});

describe("Log Pose markdown rendering (#377)", () => {
  it("renders HTML in an answer as text, never as markup (#377)", () => {
    const html = renderToStaticMarkup(<Markdown text={'<img src=x onerror="alert(1)"> and **<script>bad()</script>**'} />);
    expect(html).not.toContain("<img");
    expect(html).not.toContain("<script");
    expect(html).toContain("&lt;img src=x onerror=&quot;alert(1)&quot;&gt;");
    expect(html).toContain("<strong>&lt;script&gt;bad()&lt;/script&gt;</strong>");
  });

  it("renders a javascript: link as plain text and http links in a new tab with noopener (#377)", () => {
    const html = renderToStaticMarkup(<Markdown text="[evil](javascript:alert(1)) [rules](https://example.com/rules)" />);
    expect(html).not.toContain("javascript:");
    expect(html).toContain('<a href="https://example.com/rules" target="_blank" rel="noopener noreferrer">rules</a>');
    expect(html.match(/<a /g)).toHaveLength(1);
  });

  it("renders a streamed answer's list and table as list and table elements (#377)", () => {
    const html = renderToStaticMarkup(<Markdown text={"- Draw\n- Attack\n\n| Leader | WR |\n|---|---|\n| Enel | 54% |"} />);
    expect(html).toContain("<ul><li>Draw</li><li>Attack</li></ul>");
    expect(html).toContain("<th>Leader</th><th>WR</th>");
    expect(html).toContain("<td>Enel</td><td>54%</td>");
  });
});

const cite = (at: number, source: string, cited_text: string, title: string): PlacedCitation => ({ at, source, title, cited_text });
const TEXT = "Zoro costs 3. Blockers rest. He wins by trading.";
const CITES = [
  cite(13, "card:OP01-001", "cost 3", "Zoro (OP01-001)"),
  cite(28, "rule:6-5-3", "Blocker rests", "Rules §6-5-3 Blocker"),
  cite(28, "card:OP01-001", "power 5000", "Zoro (OP01-001)"),
];

describe("sources in a Log Pose answer (#390)", () => {
  it("puts a numbered marker right after each cited sentence, one number per source (#390)", () => {
    const html = renderToStaticMarkup(<CitedAnswer text={TEXT} citations={CITES} />);
    const markers = [...html.matchAll(/<button type="button" class="lp-cite"[^>]*aria-label="Source (\d+): ([^"]*)"[^>]*>(\d+)<\/button>/g)].map((m) => [m[1], m[2], m[3]]);
    expect(markers).toEqual([
      ["1", "Zoro (OP01-001)", "1"],
      ["2", "Rules §6-5-3 Blocker", "2"],
      ["1", "Zoro (OP01-001)", "1"],
    ]);
    expect(html).toContain("Zoro costs 3.<button");
    expect(html).toContain("Blockers rest.<button");
    expect(html).toMatch(/Blockers rest\.<button[^>]*>2<\/button><button[^>]*>1<\/button> He wins/);
  });

  it("lists each cited source once under the answer, with its kind (#390)", () => {
    const html = renderToStaticMarkup(<CitedAnswer text={TEXT} citations={CITES} />);
    expect(html).toContain("Sources (2)");
    expect(html.match(/<li class="lp-src"/g)).toHaveLength(2);
    expect(html).toContain(">Card</span>");
    expect(html).toContain(">Rules §6-5-3</span>");
  });

  it("says an answer that cites nothing is Log Pose's own judgement, but not while it is still streaming or empty (#390)", () => {
    expect(renderToStaticMarkup(<CitedAnswer text="I'd cut the 1-drops." citations={[]} />)).toContain("own judgement");
    expect(renderToStaticMarkup(<CitedAnswer text="I'd cut the 1-drops." citations={[]} done={false} />)).not.toContain("own judgement");
    expect(renderToStaticMarkup(<CitedAnswer text="   " citations={[]} />)).not.toContain("own judgement");
    expect(renderToStaticMarkup(<CitedAnswer text={TEXT} citations={CITES} />)).not.toContain("own judgement");
  });

  it("shows source titles and answer text as text, and can't be made to draw a marker by the text itself (#390)", () => {
    const evil = [cite(5, "card:X", "<script>bad()</script>", '<img src=x onerror="alert(1)">')];
    const html = renderToStaticMarkup(<CitedAnswer text={"Hello \uE0007\uE001 <b>there</b>"} citations={evil} />);
    expect(html).not.toContain("<img");
    expect(html).not.toContain("<script");
    expect(html).not.toContain("<b>");
    expect(html).toContain("&lt;img src=x onerror=&quot;alert(1)&quot;&gt;");
    expect(html.match(/class="lp-cite"/g)).toHaveLength(1);
    expect(html).not.toMatch(/\uE000|\uE001/);
  });

  it("links only your own match logs, to the turn that was cited (#390)", () => {
    expect(sourceHref(parseSource("match:abc#t3"))).toBe("/history/abc#turn-3");
    expect(sourceHref(parseSource("match:abc"))).toBe("/history/abc");
    expect(sourceHref(parseSource("match:a%b/c#t2"))).toBe("/history/a%25b%2Fc#turn-2");
    expect(sourceHref(parseSource("game:g_9#t3"))).toBeNull();
    expect(sourceHref(parseSource("card:OP01-001"))).toBeNull();
  });
});
