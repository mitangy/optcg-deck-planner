import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { nameWithBreaks } from "./cardName";

describe("nameWithBreaks", () => {
  it("card names break after dots so long names can wrap (#731)", () => {
    const html = renderToStaticMarkup(<span>{nameWithBreaks("Monkey.D.Luffy")}</span>);
    expect(html).toBe("<span>Monkey.<wbr/>D.<wbr/>Luffy</span>");
    expect(html.replace(/<wbr\/>|<\/?span>/g, "")).toBe("Monkey.D.Luffy");
  });
});
