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

/**
 * The cards a lesson is about, for the line under it: not those its text already names, each once, and "Name (ID)"
 * when two of them share a name (two printings of Buggy) so the line never reads "Buggy, Buggy" (#1408).
 */
function lessonCards(l: AnalystLesson, cardName: (id: string) => string): string[] {
  const ids = [...new Set(l.cards)].filter((id) => !l.text.includes(id));
  const names = ids.map(cardName);
  return ids.map((id, i) => (names.filter((n) => n === names[i]).length > 1 ? `${names[i]} (${id})` : names[i]!));
}

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
      cards: lessonCards(l, cardName),
      actions: [
        ...(l.status !== "approved" ? [{ label: "Approve", status: "approved" as const }] : []),
        ...(l.status !== "rejected" ? [{ label: "Reject", status: "rejected" as const }] : []),
      ],
    }));
}
