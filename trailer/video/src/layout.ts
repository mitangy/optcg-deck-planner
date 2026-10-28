import {SAFE} from './theme';

export type Layout = {
  name: string;
  width: number;
  height: number;
  /** footage window (the browser frame's content area) */
  frame: {w: number; h: number; cx: number; top: number};
  /** headline block: text sits on the bottom edge of this box */
  headline: {top: number; height: number; size: number; maxW: number};
  /** eyebrow (small caps sub-caption) top edge, size */
  eyebrow: {top: number; size: number};
  compassR: number;
  /** the big phone of the phone section: screen height (width follows the 750:1624 footage), centre, and how much it grows when turned sideways */
  phone: {h: number; cx: number; cy: number; landscapeScale: number; /** vertical layouts: chips are centred at these spots (top edge y) instead of beside the phone */ chips?: {home: {x: number; y: number}; train: {x: number; y: number}; plane: {x: number; y: number}; scale: number}};
  end: {
    desktop: {scale: number; cx: number; top: number};
    phone: {w: number; h: number; cx: number; top: number; rot: number};
    headline: {top: number; size: number; lines?: number};
    lockup: {top: number; size: number};
    disclaimer: {top: number; size: number};
  };
};

export const LAYOUT_16x9: Layout = {
  name: '16x9',
  width: 1920,
  height: 1080,
  frame: {w: 1408, h: 792, cx: 960, top: 24},
  headline: {top: 920, height: 92, size: 76, maxW: 1920 - SAFE.x * 2},
  eyebrow: {top: 884, size: 23},
  compassR: 900,
  phone: {h: 700, cx: 960, cy: 452, landscapeScale: 1.45},
  end: {
    desktop: {scale: 0.7, cx: 842, top: 56},
    phone: {w: 280, h: 606, cx: 1432, top: 84, rot: 3},
    headline: {top: 726, size: 78},
    lockup: {top: 846, size: 54},
    disclaimer: {top: 980, size: 21},
  },
};

/**
 * 9:16 for Instagram Stories / Reels: the top 220px and bottom 340px are covered by the app's own UI, so the
 * headline starts below 220, the footage window ends above 1580 and nothing essential sits outside y 220..1580.
 * The footage window is nearly square: the 16:9 clips are cropped to the part that matters (see `v()` in ads.config.ts).
 */
export const LAYOUT_9x16: Layout = {
  name: '9x16',
  width: 1080,
  height: 1920,
  frame: {w: 1000, h: 980, cx: 540, top: 478},
  headline: {top: 234, height: 212, size: 92, maxW: 980},
  eyebrow: {top: 1530, size: 26},
  compassR: 760,
  phone: {
    h: 880, cx: 540, cy: 950, landscapeScale: 1.1,
    chips: {home: {x: 540, y: 1418}, train: {x: 540, y: 560}, plane: {x: 540, y: 1250}, scale: 1.2},
  },
  end: {
    desktop: {scale: 0.56, cx: 316, top: 330},
    phone: {w: 300, h: 650, cx: 800, top: 300, rot: 3},
    headline: {top: 1010, size: 92, lines: 2},
    lockup: {top: 1270, size: 62},
    disclaimer: {top: 1400, size: 28},
  },
};

/** 4:5 for the Instagram feed: only small margins, nothing is covered. */
export const LAYOUT_4x5: Layout = {
  name: '4x5',
  width: 1080,
  height: 1350,
  frame: {w: 1008, h: 920, cx: 540, top: 252},
  headline: {top: 36, height: 196, size: 82, maxW: 1000},
  eyebrow: {top: 1236, size: 24},
  compassR: 720,
  phone: {
    h: 780, cx: 540, cy: 712, landscapeScale: 1.2,
    chips: {home: {x: 540, y: 1112}, train: {x: 540, y: 340}, plane: {x: 540, y: 1000}, scale: 1.1},
  },
  end: {
    desktop: {scale: 0.52, cx: 300, top: 110},
    phone: {w: 270, h: 585, cx: 810, top: 100, rot: 3},
    headline: {top: 770, size: 84, lines: 2},
    lockup: {top: 985, size: 56},
    disclaimer: {top: 1120, size: 26},
  },
};
