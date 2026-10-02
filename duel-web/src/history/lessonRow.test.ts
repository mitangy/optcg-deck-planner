import { describe, expect, it } from "vitest";
import type { AnalystLesson } from "./historyApi";
import { lessonRows } from "./lessonRow";

const lesson = (over: Partial<AnalystLesson>): AnalystLesson => ({
  id: 1,
  status: "draft",
  text: "Hold Kuzan until they swing with 2 rested DON",
  leader_id: null,
  opponent_id: null,
  cards: [],
  match_ids: [],
  created_at: null,
  reviewed_at: null,
  ...over,
});
const name = (id: string) => `<${id}>`;

describe("Log Pose lesson review list", () => {
  it("puts drafts first and keeps newest first within each status (#246)", () => {
    const rows = lessonRows(
      [
        lesson({ id: 5, status: "approved" }),
        lesson({ id: 4, status: "rejected" }),
        lesson({ id: 3, status: "draft" }),
        lesson({ id: 2, status: "approved" }),
        lesson({ id: 1, status: "draft" }),
      ],
      name,
    );
    expect(rows.map((r) => r.id)).toEqual([3, 1, 5, 2, 4]);
  });

  it("offers only the reviews that change a lesson's status (#246)", () => {
    const [draft, approved, rejected] = lessonRows(
      [lesson({ id: 1 }), lesson({ id: 2, status: "approved" }), lesson({ id: 3, status: "rejected" })],
      name,
    );
    expect(draft.actions.map((a) => a.status)).toEqual(["approved", "rejected"]);
    expect(approved.actions.map((a) => a.status)).toEqual(["rejected"]);
    expect(rejected.actions.map((a) => a.status)).toEqual(["approved"]);
  });

  it("names the matchup and cards a lesson is about (#246)", () => {
    const rows = lessonRows(
      [
        lesson({ id: 1, leader_id: "OP01-001", opponent_id: "OP05-060", cards: ["OP02-121"] }),
        lesson({ id: 2, leader_id: "OP01-001" }),
        lesson({ id: 3, opponent_id: "OP05-060" }),
        lesson({ id: 4 }),
      ],
      name,
    );
    expect(rows.map((r) => r.about)).toEqual(["<OP01-001> vs <OP05-060>", "<OP01-001>", "vs <OP05-060>", null]);
    expect(rows[0].cards).toEqual(["<OP02-121>"]);
  });
});
