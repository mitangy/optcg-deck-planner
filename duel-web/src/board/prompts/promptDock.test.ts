import { describe, expect, it } from "vitest";
import { dockAt, pulledLoose } from "./promptDock";

const COLUMNS = { left: { left: 0, right: 260 }, right: { left: 940, right: 1280 } };

describe("dockAt (#449)", () => {
  it("docks a pop-up let go over a side column, on that column's side (#449)", () => {
    expect(dockAt(120, 1280, COLUMNS)).toBe("left");
    expect(dockAt(1100, 1280, COLUMNS)).toBe("right");
  });

  it("the screen's edge strip docks only toward a side with a column (#1245)", () => {
    const onlyRight = { left: null, right: COLUMNS.right };
    const onlyLeft = { left: COLUMNS.left, right: null };
    expect(dockAt(10, 1280, onlyRight)).toBeNull();
    expect(dockAt(1270, 1280, onlyRight)).toBe("right");
    expect(dockAt(1270, 1280, onlyLeft)).toBeNull();
    expect(dockAt(10, 1280, onlyLeft)).toBe("left");
    expect(dockAt(10, 1280, COLUMNS)).toBe("left");
    expect(dockAt(1270, 1280, COLUMNS)).toBe("right");
    // Columns set in from the screen's edge: the strip still docks to them.
    const inset = { left: { left: 30, right: 260 }, right: { left: 940, right: 1250 } };
    expect(dockAt(10, 1280, inset)).toBe("left");
    expect(dockAt(1270, 1280, inset)).toBe("right");
  });

  it("stays floating over the board and with no column at all (#449)", () => {
    const none = { left: null, right: null };
    expect(dockAt(10, 1280, none)).toBeNull();
    expect(dockAt(1270, 1280, none)).toBeNull();
    expect(dockAt(640, 1280, COLUMNS)).toBeNull();
    expect(dockAt(640, 1280, none)).toBeNull();
  });

  it("does not dock just outside the edge strip or just inside the board (#449)", () => {
    expect(dockAt(40, 1280, { left: null, right: null })).toBeNull();
    expect(dockAt(261, 1280, COLUMNS)).toBeNull();
    expect(dockAt(939, 1280, COLUMNS)).toBeNull();
  });
});

describe("pulledLoose (#449)", () => {
  it("lets a docked pop-up come loose only past a small drag, in any direction (#449)", () => {
    expect(pulledLoose(10, 10)).toBe(false);
    expect(pulledLoose(0, 31)).toBe(false);
    expect(pulledLoose(32, 0)).toBe(true);
    expect(pulledLoose(-25, 25)).toBe(true);
    expect(pulledLoose(0, -40)).toBe(true);
  });
});
