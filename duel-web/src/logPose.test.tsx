import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Markdown, messageContext } from "@optcg/analyst-client";
import { deckContext, reviewMode, showsLogPose } from "./logPose";

describe("Log Pose compass placement (#log-pose-chat)", () => {
  it("stays off every route that renders a board (#log-pose-chat)", () => {
    for (const path of ["/duel", "/hotseat", "/demo", "/watch/abc123"]) expect(showsLogPose(path), path).toBe(false);
  });

  it("shows on the lobby, decks, deck editor, settings, history and legal pages (#log-pose-chat)", () => {
    for (const path of ["/", "/decks", "/decks/abc/configure", "/settings", "/history", "/history/m1", "/terms"]) {
      expect(showsLogPose(path), path).toBe(true);
    }
  });
});

describe("Log Pose page context (#log-pose-chat)", () => {
  it("sends the deck being edited as one entry per card with its copies (#log-pose-chat)", () => {
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

  it("leaves the deck out of the next message after the chip's × is pressed, keeping the page id (#log-pose-chat)", () => {
    const page = { page: "deck-editor", label: "Enel", deck: deckContext({ name: "Enel", leaderId: "OP05-098", cards: ["OP05-100"] }) };
    expect(messageContext(page, false)).toEqual({ page: "deck-editor", deck: page.deck });
    expect(messageContext(page, true)).toEqual({ page: "deck-editor" });
  });
});

describe("post-game review on the match log (#log-pose-chat)", () => {
  it("never generates a review for a game that was cut off (#log-pose-chat)", () => {
    expect(reviewMode(true, false)).toBe("cut-off");
    expect(reviewMode(true, true)).toBe("auto");
    expect(reviewMode(true, undefined)).toBe("auto");
  });

  it("shows nothing while chat is off or unknown (#log-pose-chat)", () => {
    expect(reviewMode(false, true)).toBe("hidden");
    expect(reviewMode(null, true)).toBe("hidden");
  });
});

describe("Log Pose markdown rendering (#log-pose-chat)", () => {
  it("renders HTML in an answer as text, never as markup (#log-pose-chat)", () => {
    const html = renderToStaticMarkup(<Markdown text={'<img src=x onerror="alert(1)"> and **<script>bad()</script>**'} />);
    expect(html).not.toContain("<img");
    expect(html).not.toContain("<script");
    expect(html).toContain("&lt;img src=x onerror=&quot;alert(1)&quot;&gt;");
    expect(html).toContain("<strong>&lt;script&gt;bad()&lt;/script&gt;</strong>");
  });

  it("renders a javascript: link as plain text and http links in a new tab with noopener (#log-pose-chat)", () => {
    const html = renderToStaticMarkup(<Markdown text="[evil](javascript:alert(1)) [rules](https://example.com/rules)" />);
    expect(html).not.toContain("javascript:");
    expect(html).toContain('<a href="https://example.com/rules" target="_blank" rel="noopener noreferrer">rules</a>');
    expect(html.match(/<a /g)).toHaveLength(1);
  });

  it("renders a streamed answer's list and table as list and table elements (#log-pose-chat)", () => {
    const html = renderToStaticMarkup(<Markdown text={"- Draw\n- Attack\n\n| Leader | WR |\n|---|---|\n| Enel | 54% |"} />);
    expect(html).toContain("<ul><li>Draw</li><li>Attack</li></ul>");
    expect(html).toContain("<th>Leader</th><th>WR</th>");
    expect(html).toContain("<td>Enel</td><td>54%</td>");
  });
});
