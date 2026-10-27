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
  phone: {h: number; cx: number; cy: number; landscapeScale: number};
  end: {
    desktop: {scale: number; cx: number; top: number};
    phone: {w: number; h: number; cx: number; top: number; rot: number};
    headline: {top: number; size: number};
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

export const LAYOUT_9x16: Layout = {
  name: '9x16',
  width: 1080,
  height: 1920,
  frame: {w: 960, h: 1060, cx: 540, top: 520},
  headline: {top: 170, height: 300, size: 84, maxW: 940},
  eyebrow: {top: 1700, size: 24},
  compassR: 760,
  phone: {h: 940, cx: 540, cy: 1000, landscapeScale: 1.06},
  end: {
    desktop: {scale: 0.54, cx: 330, top: 250},
    phone: {w: 400, h: 866, cx: 700, top: 420, rot: 3},
    headline: {top: 1410, size: 84},
    lockup: {top: 1590, size: 60},
    disclaimer: {top: 1730, size: 22},
  },
};
