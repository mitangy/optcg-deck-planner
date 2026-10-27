export type ClipId =
  | '01-landing' | '02-turn' | '03-themes' | '04-custom-art' | '05-layout' | '06-friends'
  | '07-spectate' | '08-ranked' | '09-logpose' | '10-planner' | '11-phone' | '12-phone-portrait' | '13-phone-landscape';

export type Rect = {x: number; y: number; w: number; h: number};
export type FocusKey = {at: number; rect: Rect};
export type Transition = 'cut' | 'fade' | 'zoom' | 'wipe-right' | 'wipe-left';

export type ClipDef = {file: string; duration: number; orientation: 'landscape' | 'portrait'; /** width / height when not 16:9 or 750:1624 */ aspect?: number};

export type SceneDef = {
  id: string;
  clip: ClipId;
  /** seconds on the timeline */
  start: number;
  dur: number;
  /** seconds into the clip where this scene begins */
  trimStart?: number;
  /** playback speed of the footage */
  rate?: number;
  /** seconds to hold the clip's first frame before it starts playing */
  clipDelay?: number;
  transition: Transition;
  focus: FocusKey[];
  /** small caps line above the headline while this scene is on */
  eyebrow?: string;
};

export type CaptionWord = {t: string; em?: boolean};
export type CaptionDef = {start: number; end: number; words: CaptionWord[]};
