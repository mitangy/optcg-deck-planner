/** Report player: what the dialog collects and the request it becomes. Pure, so the rules are testable. */
export type ReportReason = "conduct" | "toxic" | "image";
export type ReportSource = "match" | "spectate" | "postmatch" | "history" | "friends";
export type ImageKind = "playmat" | "cardBack";

export const MAX_REPORT_NOTE = 500;

export const REPORT_REASONS: readonly { id: ReportReason; label: string }[] = [
  { id: "conduct", label: "Breaking the rules of conduct" },
  { id: "toxic", label: "Toxic or abusive behavior" },
  { id: "image", label: "Inappropriate playmat or card back" },
];

export const IMAGE_KINDS: readonly { id: ImageKind; label: string }[] = [
  { id: "playmat", label: "Playmat" },
  { id: "cardBack", label: "Card back" },
];

/** What the reporter currently sees for a player; null = the default art. Absent when the screen does not know. */
export type ReportImages = { playmat: string | null; cardBack: string | null };

export type ReportPlayer = {
  name: string;
  /** In a match: the seat of the reported player. */
  seat?: 0 | 1;
  /** From the friends list. */
  userId?: number;
  images?: ReportImages;
};

/** Where a report starts: the players it can be about (two when spectating) and the match it came from. */
export type ReportTarget = {
  source: ReportSource;
  matchId?: string;
  players: readonly ReportPlayer[];
};

export type ReportDraft = {
  reason: ReportReason | null;
  imageKind: ImageKind | null;
  note: string;
  player: ReportPlayer | null;
};

export type ReportRequest = {
  reason: ReportReason;
  source: ReportSource;
  match_id?: string;
  reported_seat?: 0 | 1;
  reported_user_id?: number;
  image_kind?: ImageKind;
  image_src?: string;
  note?: string;
};

/** The reason a draft cannot be sent yet, or null. */
export function draftProblem(d: ReportDraft): string | null {
  if (!d.player) return "Choose who you are reporting.";
  if (!d.reason) return "Choose why you are reporting.";
  if (d.reason === "image" && !d.imageKind) return "Choose the playmat or the card back.";
  if (d.note.trim().length > MAX_REPORT_NOTE) return `Keep the note under ${MAX_REPORT_NOTE} characters.`;
  return null;
}

/** The POST /duel/reports body. A match report names the opponent by seat, never by the reporter's own. */
export function buildReportRequest(target: ReportTarget, d: ReportDraft): ReportRequest {
  const problem = draftProblem(d);
  if (problem || !d.player || !d.reason) throw new Error(problem ?? "Incomplete report");
  const body: ReportRequest = { reason: d.reason, source: target.source };
  if (target.matchId) {
    body.match_id = target.matchId;
    if (d.player.seat !== undefined) body.reported_seat = d.player.seat;
  }
  if (!target.matchId && d.player.userId !== undefined) body.reported_user_id = d.player.userId;
  if (d.reason === "image" && d.imageKind) {
    body.image_kind = d.imageKind;
    const src = d.player.images?.[d.imageKind];
    if (src) body.image_src = src;
  }
  const note = d.note.trim();
  if (note) body.note = note;
  return body;
}

/** Whether the player's playmat / card back is the default (known only when the screen passed the images). */
export function isDefaultImage(player: ReportPlayer, kind: ImageKind): boolean {
  return player.images !== undefined && !player.images[kind];
}

/** The image reason needs something to report: unavailable when we know both pieces of art are the defaults. */
export function imageReasonAvailable(player: ReportPlayer | null): boolean {
  if (!player) return true;
  return !(isDefaultImage(player, "playmat") && isDefaultImage(player, "cardBack"));
}

export function reportErrorMessage(status: number): string {
  switch (status) {
    case 429:
      return "You have sent a lot of reports recently. Please try again later.";
    case 401:
      return "Sign in to report a player.";
    case 403:
      return "You can only report players from your own matches, matches you are watching, or your friends list.";
    case 404:
      return "We could not find that player. Bots and guests cannot be reported.";
    case 400:
      return "That player cannot be reported.";
    default:
      return "Could not send the report. Try again.";
  }
}
