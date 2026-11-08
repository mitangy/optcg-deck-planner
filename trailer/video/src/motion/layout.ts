/** Positions and sizes for the motion piece. One implementation, two layouts: scenes read everything from here. */
export type MotionLayout = {
  name: string;
  width: number;
  height: number;
  vertical: boolean;
  bg: {cx: number; cy: number; compass: number};
  logo: {size: number; cy: number; titleSize: number; titleY: number; subSize: number; subY: number; lineW: number};
  storm: {wordY: number; wordSize: number; handCx: number; handCy: number; cardH: number; spread: number; fan: number; drop: number};
  attack: {cardH: number; leftX: number; rightX: number; cy: number; captionY: number; captionSize: number; badgeSize: number; arcLift: number};
  features: {aspect: number; panelW: number; cx: number; cy: number; dx: number; dy: number; ry: number; rx: number; labelSize: number; perspective: number};
  themes: {matZoom: number; aspect: number; panelW: number; cx: number; cy: number; titleY: number; titleSize: number; chipSize: number};
  anywhere: {textCx: number; textY: number; textSize: number; phoneCx: number; phoneCy: number; phoneH: number; landScale: number; deskW: number};
  stats: {titleY: number; titleSize: number; tiles: {x: number; y: number; w: number; h: number}[]; bigSize: number; subSize: number};
  end: {logoSize: number; logoY: number; headY: number; headSize: number; pillY: number; pillSize: number; discY: number; discSize: number; discW: number};
};

export const MOTION_16x9: MotionLayout = {
  name: '16x9', width: 1920, height: 1080, vertical: false,
  bg: {cx: 960, cy: 540, compass: 700},
  logo: {size: 230, cy: 330, titleSize: 170, titleY: 640, subSize: 44, subY: 800, lineW: 760},
  storm: {wordY: 270, wordSize: 270, handCx: 960, handCy: 835, cardH: 440, spread: 150, fan: 6.2, drop: 9},
  attack: {cardH: 620, leftX: 610, rightX: 1310, cy: 520, captionY: 985, captionSize: 44, badgeSize: 46, arcLift: 190},
  features: {aspect: 16 / 9, panelW: 940, cx: 960, cy: 572, dx: 250, dy: 134, ry: -18, rx: 8, labelSize: 38, perspective: 2600},
  themes: {matZoom: 1, aspect: 16 / 9, panelW: 1340, cx: 960, cy: 610, titleY: 105, titleSize: 118, chipSize: 38},
  anywhere: {textCx: 470, textY: 540, textSize: 124, phoneCx: 1400, phoneCy: 540, phoneH: 760, landScale: 1.12, deskW: 1000},
  stats: {
    titleY: 150, titleSize: 96,
    tiles: [0, 1, 2].map((i) => ({x: 130 + i * 560, y: 300, w: 520, h: 560})),
    bigSize: 80, subSize: 32,
  },
  end: {logoSize: 210, logoY: 250, headY: 520, headSize: 100, pillY: 690, pillSize: 54, discY: 960, discSize: 24, discW: 1400},
};

/** 9:16: text stays inside y 220..1580 (Instagram covers the top 220 and bottom 340 px). */
export const MOTION_9x16: MotionLayout = {
  name: '9x16', width: 1080, height: 1920, vertical: true,
  bg: {cx: 540, cy: 960, compass: 820},
  logo: {size: 240, cy: 700, titleSize: 128, titleY: 1000, subSize: 40, subY: 1185, lineW: 600},
  storm: {wordY: 560, wordSize: 230, handCx: 540, handCy: 1240, cardH: 440, spread: 82, fan: 6.2, drop: 9},
  attack: {cardH: 520, leftX: 285, rightX: 790, cy: 960, captionY: 1440, captionSize: 40, badgeSize: 40, arcLift: 200},
  features: {aspect: 1.35, panelW: 780, cx: 540, cy: 960, dx: 50, dy: 215, ry: -9, rx: 5, labelSize: 36, perspective: 2400},
  themes: {matZoom: 1.75, aspect: 1, panelW: 980, cx: 540, cy: 960, titleY: 340, titleSize: 120, chipSize: 36},
  anywhere: {textCx: 540, textY: 400, textSize: 120, phoneCx: 540, phoneCy: 1000, phoneH: 880, landScale: 1.0, deskW: 940},
  stats: {
    titleY: 320, titleSize: 96,
    tiles: [0, 1, 2].map((i) => ({x: 70, y: 450 + i * 385, w: 940, h: 355})),
    bigSize: 92, subSize: 36,
  },
  end: {logoSize: 230, logoY: 600, headY: 860, headSize: 92, pillY: 1090, pillSize: 50, discY: 1440, discSize: 24, discW: 860},
};
