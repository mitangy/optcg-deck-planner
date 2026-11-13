// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { EACH_ART_ID, resolveCardImageUrl } from "../../decks/artPrefs";
import { _resetSeatArtPrefsForTests, replaceSeatArtPrefs } from "../../decks/seatArtPrefs";
import type { Intent, PlayerView } from "../../net/protocol";
import { DEMO_VIEW } from "../fixtures/demoViews";
import { stubBattle, stubCard } from "../fixtures/stubCard";
import { deriveDefend } from "../combat/defendModel";
import { CardTile } from "./CardTile";
import { TrashViewerPanel } from "./TrashViewer";
import { ZonePile } from "./ZonePile";

// "One of each art" (#1292): every place that draws a copy of an any-number card passes its copy rank on.

const SLEEPTIDS = "OP18-093";
const standard = () => resolveCardImageUrl(SLEEPTIDS, { ownerSeat: 1 })!;
const copyArt = (artCopy: number) => resolveCardImageUrl(SLEEPTIDS, { ownerSeat: 0, artCopy })!;

let root: Root | null = null;
let host: HTMLElement | null = null;

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  (globalThis as { localStorage?: Storage }).localStorage ??= {
    getItem: () => null,
    setItem: () => undefined,
    removeItem: () => undefined,
    clear: () => undefined,
    key: () => null,
    length: 0,
  };
});
beforeEach(() => {
  replaceSeatArtPrefs(0, { [SLEEPTIDS]: EACH_ART_ID });
});
afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
  _resetSeatArtPrefsForTests();
});

function render(node: React.ReactElement): HTMLElement {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => root!.render(node));
  return host;
}

describe("One of each art on the board (#1292)", () => {
  it("a tile shows the art of its own copy (#1292)", () => {
    expect(copyArt(1)).not.toBe(copyArt(0));
    const el = render(
      <>
        <CardTile defId={SLEEPTIDS} artCopy={1} ownerSeat={0} />
        <CardTile defId={SLEEPTIDS} artCopy={2} ownerSeat={0} />
      </>,
    );
    const srcs = [...el.querySelectorAll("img")].map((i) => i.getAttribute("src"));
    expect(srcs).toEqual([copyArt(1), copyArt(2)]);
  });

  it("the trash pile top shows the art of the top card's copy (#1292)", () => {
    expect(copyArt(2)).not.toBe(standard());
    const el = render(<ZonePile label="Trash" count={2} variant="trash" topDefId={SLEEPTIDS} topArtCopy={2} ownerSeat={0} />);
    expect(el.querySelector("img.zone-pile-face.top")!.getAttribute("src")).toBe(copyArt(2));
  });

  it("a face-up Life card shows the art of its copy (#1292)", () => {
    // Two cards in Life, the second (index 1) face up: drawn as face 0 of 2.
    const el = render(
      <ZonePile label="Life" count={2} variant="life" faceUp={[{ index: 1, defId: SLEEPTIDS, artCopy: 2 }]} ownerSeat={0} />,
    );
    const face = el.querySelector<HTMLElement>(".zone-pile-face.is-face-up")!;
    expect(face.style.getPropertyValue("--life-face-art")).toContain(copyArt(2));
  });

  it("the trash browser shows each card's own copy, newest first (#1292)", () => {
    const el = render(
      <TrashViewerPanel title="Trash" cards={[SLEEPTIDS, SLEEPTIDS]} copies={[2, 1]} ownerSeat={0} onClose={() => undefined} />,
    );
    expect([...el.querySelectorAll(".trash-viewer-grid img")].map((i) => i.getAttribute("src"))).toEqual([copyArt(2), copyArt(1)]);
  });

  it("a blocker chip carries its copy so the defend tray shows its art (#1292)", () => {
    const view: PlayerView = {
      ...DEMO_VIEW,
      phase: "block",
      you: { ...DEMO_VIEW.you, characters: [stubCard({ id: "y-s", defId: SLEEPTIDS, artCopy: 2, power: 3000, printedPower: 3000, statusLabels: [] })] },
      battle: stubBattle({ attackerSeat: 1, attackerId: "o-leader", target: { kind: "leader" } }),
    };
    const intents: Intent[] = [{ type: "pass_block" }, { type: "declare_block", blockerId: "y-s" }];
    const d = deriveDefend(view, intents, { counterIds: [], blockerId: null })!;
    expect(d.blockers.map((b) => [b.id, b.artCopy])).toEqual([["y-s", 2]]);
  });
});
