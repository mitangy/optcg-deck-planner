import { describe, expect, it } from "vitest";
import { emptyIntentText } from "./IntentBar";

describe("emptyIntentText", () => {
  const base = { mulliganWaiting: false, idle: null, nothingSelected: true, hasIntents: false } as const;

  it("says to answer your prompt instead of 'No legal actions' (#262)", () => {
    expect(emptyIntentText({ ...base, idle: "prompt" })).toBe("Answer the prompt to continue");
  });

  it("says it is waiting on the opponent instead of 'No legal actions' (#262)", () => {
    expect(emptyIntentText({ ...base, idle: "opponent" })).toBe("Waiting for your opponent…");
  });
});
