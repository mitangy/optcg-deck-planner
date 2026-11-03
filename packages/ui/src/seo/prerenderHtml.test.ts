import { describe, expect, it } from "vitest";
import { applyHead, injectRoot, jsonForScript } from "./prerenderHtml";

const TEMPLATE = `<!doctype html><html><head>
<title>Old</title>
<meta name="description" content="old description" />
<link rel="canonical" href="https://example.test/" />
<meta property="og:title" content="Old" />
<meta property="og:url" content="https://example.test/" />
<meta property="og:image" content="https://example.test/og-image.png" />
</head><body><div id="root"></div></body></html>`;

describe("pre-rendered page head (#914)", () => {
  it("swaps the title, canonical and share tags for the page's own and escapes quotes (#914)", () => {
    const html = applyHead(TEMPLATE, {
      title: 'Sabo "Red" deck',
      description: "A & B",
      canonical: "https://example.test/leaders/op13-004-sabo",
      image: "https://cdn.test/sabo.jpg",
    });
    expect(html).toContain("<title>Sabo &quot;Red&quot; deck</title>");
    expect(html).toContain('<meta name="description" content="A &amp; B" />');
    expect(html.match(/rel="canonical"/g)).toHaveLength(1);
    expect(html).toContain('<link rel="canonical" href="https://example.test/leaders/op13-004-sabo" />');
    expect(html).toContain('<meta property="og:url" content="https://example.test/leaders/op13-004-sabo" />');
    expect(html).toContain('<meta property="og:image" content="https://cdn.test/sabo.jpg" />');
    expect(html).not.toContain("old description");
  });

  it("a noindex page gets no canonical link and a robots tag (#914)", () => {
    const html = applyHead(TEMPLATE, { title: "T", description: "D", canonical: "https://example.test/x", noindex: true });
    expect(html).not.toContain('rel="canonical"');
    expect(html).toContain('<meta name="robots" content="noindex" />');
  });

  it("adds a social tag the template lacks instead of skipping it (#914)", () => {
    const html = applyHead(TEMPLATE, { title: "T", description: "D", canonical: "https://example.test/x", image: "https://cdn.test/a.jpg" });
    expect(html).toContain('<meta name="twitter:image" content="https://cdn.test/a.jpg" />');
  });
});

describe("injectRoot (#914)", () => {
  it("fills #root, marks it prerendered and embeds the page data without letting it close the script (#914)", () => {
    const html = injectRoot(TEMPLATE, "<h1>Hi</h1>", { id: "seed", value: { text: "</script><b>" } });
    expect(html).toContain('<div id="root" data-prerendered><h1>Hi</h1></div>');
    expect(html).toContain('<script type="application/json" id="seed">');
    expect(html.match(/<\/script>/g)).toHaveLength(1);
    expect(jsonForScript({ a: "<" })).toBe('{"a":"\\u003c"}');
  });

  it("refuses a template that already has content in #root (#914)", () => {
    expect(() => injectRoot(TEMPLATE.replace('<div id="root"></div>', '<div id="root"><p>x</p></div>'), "<p/>")).toThrow(/empty/);
  });
});
