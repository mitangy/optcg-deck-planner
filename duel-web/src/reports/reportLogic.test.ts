import { describe, expect, it } from "vitest";
import { buildReportRequest, draftProblem, imageReasonAvailable, isDefaultImage, type ReportDraft, type ReportPlayer, type ReportTarget } from "./reportLogic";

const opp: ReportPlayer = { name: "Nami", seat: 1, images: { playmat: "https://api/duel/cosmetics/5/public/abcdefghijklmnop", cardBack: "data:image/png;base64,AAAA" } };
const target: ReportTarget = { source: "match", matchId: "room-1", players: [opp] };
const draft = (o: Partial<ReportDraft> = {}): ReportDraft => ({ reason: "conduct", imageKind: null, note: "", player: opp, ...o });

describe("report request (#810)", () => {
  it("names the match and the reported seat, and sends only a trimmed note (#810)", () => {
    expect(buildReportRequest(target, draft({ note: "  rude in chat  " }))).toEqual({
      reason: "conduct",
      source: "match",
      match_id: "room-1",
      reported_seat: 1,
      note: "rude in chat",
    });
    expect(buildReportRequest(target, draft({ note: "   " }))).not.toHaveProperty("note");
  });

  it("sends the image the reporter sees for the chosen kind, and no image fields for other reasons (#810)", () => {
    const mat = buildReportRequest(target, draft({ reason: "image", imageKind: "playmat" }));
    expect(mat).toMatchObject({ image_kind: "playmat", image_src: opp.images!.playmat });
    const back = buildReportRequest(target, draft({ reason: "image", imageKind: "cardBack" }));
    expect(back).toMatchObject({ image_kind: "cardBack", image_src: opp.images!.cardBack });
    const toxic = buildReportRequest(target, draft({ reason: "toxic", imageKind: "playmat" }));
    expect(toxic).not.toHaveProperty("image_kind");
    expect(toxic).not.toHaveProperty("image_src");
  });

  it("reports a friend by user id with no match (#810)", () => {
    const friend: ReportPlayer = { name: "Zoro", userId: 42 };
    const body = buildReportRequest({ source: "friends", players: [friend] }, draft({ player: friend }));
    expect(body).toEqual({ reason: "conduct", source: "friends", reported_user_id: 42 });
  });

  it("will not send an image report without a playmat or card back chosen, nor without a reason or player (#810)", () => {
    expect(draftProblem(draft({ reason: "image", imageKind: null }))).toMatch(/playmat or the card back/);
    expect(() => buildReportRequest(target, draft({ reason: "image", imageKind: null }))).toThrow();
    expect(draftProblem(draft({ reason: null }))).not.toBeNull();
    expect(draftProblem(draft({ player: null }))).not.toBeNull();
    expect(draftProblem(draft({ reason: "image", imageKind: "cardBack" }))).toBeNull();
  });

  it("treats art as the default only when the screen knows it is, and offers the image reason unless both are (#810)", () => {
    const plain: ReportPlayer = { name: "A", seat: 0, images: { playmat: null, cardBack: "data:image/png;base64,AAAA" } };
    expect(isDefaultImage(plain, "playmat")).toBe(true);
    expect(isDefaultImage(plain, "cardBack")).toBe(false);
    expect(isDefaultImage({ name: "Friend", userId: 3 }, "playmat")).toBe(false);
    expect(imageReasonAvailable(plain)).toBe(true);
    expect(imageReasonAvailable({ name: "A", seat: 0, images: { playmat: null, cardBack: null } })).toBe(false);
  });
});
