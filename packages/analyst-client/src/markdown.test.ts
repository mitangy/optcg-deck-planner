import { describe, expect, it } from "vitest";
import { parseInline, parseMarkdown, type Inline } from "./markdown";

/** Flattens inline nodes to a compact string so assertions stay readable. */
function show(nodes: Inline[]): string {
  return nodes
    .map((n) => {
      switch (n.t) {
        case "text":
          return n.v;
        case "b":
          return `<b>${show(n.c)}</b>`;
        case "i":
          return `<i>${show(n.c)}</i>`;
        case "code":
          return `<code>${n.v}</code>`;
        case "a":
          return `<a ${n.href}>${show(n.c)}</a>`;
        case "br":
          return "<br>";
      }
    })
    .join("");
}

describe("Log Pose markdown (#377)", () => {
  it("does not turn javascript: or data: links into links (#377)", () => {
    const nodes = parseInline("[click](javascript:alert(1)) and [x](data:text/html,hi) and [ok](https://example.com/a)");
    expect(nodes.filter((n) => n.t === "a")).toEqual([{ t: "a", href: "https://example.com/a", c: [{ t: "text", v: "ok" }] }]);
    expect(show(nodes)).toBe("click and x and <a https://example.com/a>ok</a>");
  });

  it("parses bold, italic and inline code, leaving snake_case and code contents alone (#377)", () => {
    expect(show(parseInline("**Enel** is *fast*; see `OP05-100_p1` and snake_case_id"))).toBe(
      "<b>Enel</b> is <i>fast</i>; see <code>OP05-100_p1</code> and snake_case_id",
    );
  });

  it("parses a pipe table with its header and rows (#377)", () => {
    const blocks = parseMarkdown("Matchups:\n\n| Leader | Win rate |\n|---|---:|\n| Enel | 54% |\n| Nami | **48%** |\n\nDone.");
    expect(blocks.map((b) => b.t)).toEqual(["p", "table", "p"]);
    const table = blocks[1] as Extract<(typeof blocks)[number], { t: "table" }>;
    expect(table.head.map(show)).toEqual(["Leader", "Win rate"]);
    expect(table.rows.map((r) => r.map(show))).toEqual([
      ["Enel", "54%"],
      ["Nami", "<b>48%</b>"],
    ]);
  });

  it("parses bullet and numbered lists, keeping the numbered list's start (#377)", () => {
    const blocks = parseMarkdown("- one\n- two\n  continued\n\n3. third\n4. fourth");
    expect(blocks).toEqual([
      { t: "ul", items: [[{ t: "text", v: "one" }], [{ t: "text", v: "two" }, { t: "br" }, { t: "text", v: "continued" }]] },
      { t: "ol", start: 3, items: [[{ t: "text", v: "third" }], [{ t: "text", v: "fourth" }]] },
    ]);
  });

  it("keeps a fenced code block verbatim, markdown and all (#377)", () => {
    const blocks = parseMarkdown("```\n4xOP01-006\n**not bold**\n```\nafter");
    expect(blocks[0]).toEqual({ t: "code", lang: "", v: "4xOP01-006\n**not bold**" });
    expect(blocks[1]!.t).toBe("p");
  });
});
