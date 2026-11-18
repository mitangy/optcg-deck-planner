import { afterEach, describe, expect, it, vi } from "vitest";
import { checkForUpdate, dismissUpdate } from "./appVersion";

vi.mock("./buildInfo", () => ({ BUILD_SHA: "abc1234" }));

afterEach(() => vi.unstubAllGlobals());

async function deploy(sha: string) {
  vi.stubGlobal("fetch", async () => ({ ok: true, json: async () => ({ sha }) }));
  await checkForUpdate();
}

describe("dismissing the update notice (opt-in)", () => {
  it("a dismissed build stays hidden until a newer one is deployed", async () => {
    const { usePendingUpdate } = await import("./appVersion");
    const { renderToString } = await import("react-dom/server");
    const { createElement } = await import("react");
    const pendingSha = () => {
      let sha: string | null = null;
      const Probe = () => {
        sha = usePendingUpdate()?.sha ?? null;
        return null;
      };
      renderToString(createElement(Probe));
      return sha;
    };

    await deploy("def5678");
    expect(pendingSha()).toBe("def5678");

    dismissUpdate();
    expect(pendingSha()).toBeNull();

    await deploy("def5678");
    expect(pendingSha()).toBeNull();

    await deploy("1234abc");
    expect(pendingSha()).toBe("1234abc");
  });
});
