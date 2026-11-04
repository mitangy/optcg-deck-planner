// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { THREAD_KEY, readThreadHint, writeThreadHint } from "./threadStore";

beforeEach(() => localStorage.clear());

describe("per-scope thread hints (#970)", () => {
  it("remembers a thread for each scope separately (#970)", () => {
    writeThreadHint("general", 1);
    writeThreadHint("deck:planner:7", 2);
    writeThreadHint("match:abc", 3);
    expect([readThreadHint("general"), readThreadHint("deck:planner:7"), readThreadHint("match:abc")]).toEqual([1, 2, 3]);
    expect(readThreadHint("deck:planner:8")).toBeNull();
  });

  it("reads the old single thread id as the general chat's hint, and only that scope's (#970)", () => {
    localStorage.setItem(THREAD_KEY, "41");
    expect(readThreadHint("general")).toBe(41);
    expect(readThreadHint("deck:planner:7")).toBeNull();
  });

  it("clears the old key once general writes its own hint, so a cleared general chat does not come back (#970)", () => {
    localStorage.setItem(THREAD_KEY, "41");
    writeThreadHint("general", null);
    expect(readThreadHint("general")).toBeNull();
    writeThreadHint("general", 50);
    expect(localStorage.getItem(THREAD_KEY)).toBeNull();
  });

  it("drops a scope's hint when it is cleared and ignores junk values (#970)", () => {
    writeThreadHint("deck:duel:d1", 5);
    writeThreadHint("deck:duel:d1", null);
    expect(readThreadHint("deck:duel:d1")).toBeNull();
    localStorage.setItem("optcg-logpose:threads", JSON.stringify({ "match:x": "nope", "match:y": -2 }));
    expect(readThreadHint("match:x")).toBeNull();
    expect(readThreadHint("match:y")).toBeNull();
  });

  it("keeps only the most recent scopes (#970)", () => {
    for (let i = 1; i <= 45; i++) writeThreadHint(`match:m${i}`, i);
    expect(readThreadHint("match:m1")).toBeNull();
    expect(readThreadHint("match:m45")).toBe(45);
  });
});
