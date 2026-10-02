import { describe, expect, it } from "vitest";
import { applyTextSize } from "./textSize";

function fakeRoot() {
  const props = new Map<string, string>();
  return {
    props,
    style: {
      setProperty: (n: string, v: string) => void props.set(n, v),
      removeProperty: (n: string) => void props.delete(n),
    },
  };
}

describe("text size", () => {
  it("scales text down for Small and up for Extra large, and Medium clears it (#247)", () => {
    const root = fakeRoot();
    applyTextSize("small", root);
    expect(Number(root.props.get("--text-scale"))).toBeLessThan(1);
    applyTextSize("xlarge", root);
    expect(Number(root.props.get("--text-scale"))).toBeGreaterThan(1.2);
    applyTextSize("large", root);
    const large = Number(root.props.get("--text-scale"));
    expect(large).toBeGreaterThan(1);
    expect(large).toBeLessThan(1.2);
    applyTextSize("medium", root);
    expect(root.props.has("--text-scale")).toBe(false);
  });
});
