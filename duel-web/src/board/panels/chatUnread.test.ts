import { describe, expect, it } from "vitest";
import { unreadChatCount } from "./chatUnread";

const window100 = (from: number) => Array.from({ length: 100 }, (_, i) => ({ id: `m${from + i}` }));

describe("unreadChatCount", () => {
  it("keeps counting new lines once chat is capped at 100", () => {
    // Saw m149 while 100 lines (m50..m149) were kept; three more arrived and pushed m50..m52 out.
    expect(unreadChatCount(window100(53), "m149")).toBe(3);
  });

  it("counts every kept line once the seen one has scrolled out", () => {
    expect(unreadChatCount(window100(300), "m149")).toBe(100);
  });
});
