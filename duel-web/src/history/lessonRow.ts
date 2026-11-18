import type { AnalystLesson, AnalystLessonStatus } from "./historyApi";

export type LessonAction = { label: string; status: AnalystLessonStatus };

export type LessonRow = {
  id: number;
  status: AnalystLessonStatus;
  text: string;
  about: string | null;
  fromBots: boolean;
  cards: string[];
  actions: LessonAction[];
};

const ORDER: Record<AnalystLessonStatus, number> = { draft: 0, approved: 1, rejected: 2 };

export function lessonRows(lessons: AnalystLesson[], cardName: (id: string) => string): LessonRow[] {
  return [...lessons]
    .map((l, i) => ({ l, i }))
    .sort((a, b) => ORDER[a.l.status] - ORDER[b.l.status] || a.i - b.i)
    .map(({ l }) => ({
      id: l.id,
      status: l.status,
      text: l.text,
      about: l.leader_id
        ? l.opponent_id
          ? `${cardName(l.leader_id)} vs ${cardName(l.opponent_id)}`
          : cardName(l.leader_id)
        : l.opponent_id
          ? `vs ${cardName(l.opponent_id)}`
          : null,
      fromBots: l.source === "bots",
      cards: l.cards.map(cardName),
      actions: [
        ...(l.status !== "approved" ? [{ label: "Approve", status: "approved" as const }] : []),
        ...(l.status !== "rejected" ? [{ label: "Reject", status: "rejected" as const }] : []),
      ],
    }));
}
