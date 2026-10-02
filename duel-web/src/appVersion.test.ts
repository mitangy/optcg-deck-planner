import { describe, expect, it } from "vitest";
import { compareVersions, parseDeployedVersion } from "./appVersion";

describe("app version check (#239)", () => {
  it("offers an update when the live deploy is a different commit", () => {
    const deployed = parseDeployedVersion({ sha: "def5678", builtAt: "2026-10-02T00:00:00Z" });
    expect(compareVersions("abc1234", deployed)).toEqual({
      kind: "update",
      deployed: { sha: "def5678", builtAt: "2026-10-02T00:00:00Z" },
    });
  });

  it("says up to date when the live deploy is the running commit", () => {
    expect(compareVersions("abc1234", parseDeployedVersion({ sha: "abc1234" }))).toEqual({
      kind: "latest",
    });
  });

  it("matches a full SHA in the version file against the short running SHA", () => {
    const deployed = parseDeployedVersion({ sha: "abc1234ffffffffffffffffffffffffffffffff0" });
    expect(compareVersions("abc1234", deployed)).toEqual({ kind: "latest" });
  });

  it("never nags a dev build", () => {
    expect(compareVersions("dev", parseDeployedVersion({ sha: "def5678" }))).toEqual({
      kind: "unknown",
    });
  });

  it("treats an HTML fallback page or junk as unknown, not an update", () => {
    expect(parseDeployedVersion("<!doctype html>")).toBeNull();
    expect(parseDeployedVersion({ sha: "<html>" })).toBeNull();
    expect(compareVersions("abc1234", parseDeployedVersion({ sha: 42 }))).toEqual({
      kind: "unknown",
    });
  });
});
