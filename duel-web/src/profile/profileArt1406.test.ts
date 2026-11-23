// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { lookupCard } from "../cards/atlas";
import { setArtPref } from "../decks/storage";
import { profileArtUrl } from "./profileArt";

const ID = "EB01-021";

afterEach(() => localStorage.clear());

describe("profile picture art", () => {
  const entry = lookupCard(ID);
  const [p1, p2] = entry.altArts!;

  it("uses the alt art for a known alt id and the base for empty or stale ids (#1406)", () => {
    expect(p1.imageUrl).not.toBe(p2.imageUrl);
    expect(profileArtUrl(ID, "p2", "thumb")).toContain(p2.imageUrl.split("/").pop()!.split("_")[0]);
    expect(profileArtUrl(ID, "p2", "thumb")).not.toBe(profileArtUrl(ID, "", "thumb"));
    expect(profileArtUrl(ID, "", "thumb")).toContain(entry.imageUrl!.split("/").pop()!.split("_")[0]);
    expect(profileArtUrl(ID, "gone", "thumb")).toBe(profileArtUrl(ID, "", "thumb"));
  });

  it("ignores the art picked for decks and games (#1406)", () => {
    const base = profileArtUrl(ID, "", "thumb");
    setArtPref(ID, "p2");
    expect(profileArtUrl(ID, "", "thumb")).toBe(base);
    expect(profileArtUrl(ID, "p1", "thumb")).toContain(p1.imageUrl.split("/").pop()!.split("_")[0]);
  });
});
