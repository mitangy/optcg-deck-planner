import { describe, expect, it } from "vitest";
import { leaderSlug, parseLeaderSlug, resolveLeaderRoute } from "./slug";

const LEADERS = [
  { leader_id: "OP17-039", name: "Rocks.D.Xebec" },
  { leader_id: "ST30-001", name: "Luffy & Ace" },
  { leader_id: "P-117", name: "Nami - P-117" },
  { leader_id: "OP10-099", name: 'Eustass"Captain"Kid' },
];

describe("leader page slugs (#914)", () => {
  it("builds the slug from the lower-case card id and the name (#914)", () => {
    expect(leaderSlug("OP17-039", "Rocks.D.Xebec")).toBe("op17-039-rocks-d-xebec");
    expect(leaderSlug("ST30-001", "Luffy & Ace")).toBe("st30-001-luffy-ace");
    expect(leaderSlug("P-117", "Nami - P-117")).toBe("p-117-nami-p-117");
    expect(leaderSlug("OP10-099", 'Eustass"Captain"Kid')).toBe("op10-099-eustass-captain-kid");
  });

  it("a leader without a name is just its id (#914)", () => {
    expect(leaderSlug("OP17-039", "  ")).toBe("op17-039");
  });

  it("reads the card id back from a slug, bare id or promo id (#914)", () => {
    expect(parseLeaderSlug("op17-039-rocks-d-xebec")).toEqual({ leaderId: "OP17-039", nameSlug: "rocks-d-xebec" });
    expect(parseLeaderSlug("op17-039")).toEqual({ leaderId: "OP17-039", nameSlug: "" });
    expect(parseLeaderSlug("p-117-nami-p-117")).toEqual({ leaderId: "P-117", nameSlug: "nami-p-117" });
    expect(parseLeaderSlug("rocks-d-xebec")).toBeNull();
    expect(parseLeaderSlug("op17-0390-x")).toBeNull();
  });

  it("shows the page at the canonical slug and redirects a bare id or a stale name to it (#914)", () => {
    expect(resolveLeaderRoute("op17-039-rocks-d-xebec", LEADERS)).toMatchObject({ kind: "page", leader: LEADERS[0] });
    expect(resolveLeaderRoute("op17-039", LEADERS)).toMatchObject({ kind: "redirect", to: "/leaders/op17-039-rocks-d-xebec" });
    expect(resolveLeaderRoute("op17-039-old-name", LEADERS)).toMatchObject({ kind: "redirect", to: "/leaders/op17-039-rocks-d-xebec" });
    expect(resolveLeaderRoute("OP17-039-Rocks-D-Xebec", LEADERS)).toMatchObject({ kind: "redirect", to: "/leaders/op17-039-rocks-d-xebec" });
  });

  it("a slug for a leader we have no data on is unknown, whether or not it looks like an id (#914)", () => {
    expect(resolveLeaderRoute("op99-001-nobody", LEADERS)).toEqual({ kind: "unknown", leaderId: "OP99-001" });
    expect(resolveLeaderRoute("hello", LEADERS)).toEqual({ kind: "unknown", leaderId: null });
  });
});
