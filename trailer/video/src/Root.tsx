import React from 'react';
import {Composition, Still} from 'remotion';
import {INFOGRAPHICS} from './infographics/data';
import {Infographic, SIZES} from './infographics/Infographic';
import {AD15, AD30} from './ads.config';
import {LAYOUT_16x9, LAYOUT_4x5, LAYOUT_9x16} from './layout';
import {SCENES, TOTAL_SECONDS} from './scenes.config';
import {BEAT, FPS} from './theme';
import {TrailerComp} from './Trailer';

// Cuts should land on the 120 BPM grid (0.5s) so a licensed 120 BPM track lines up.
for (const s of [...SCENES, ...AD15.scenes, ...AD30.scenes]) {
  for (const [k, v] of [['start', s.start], ['dur', s.dur]] as const) {
    if (Math.abs((v * FPS) / BEAT - Math.round((v * FPS) / BEAT)) > 1e-6) console.warn(`[trailer] scene ${s.id}.${k}=${v}s is off the 0.5s beat grid`);
  }
}

const Trailer16x9: React.FC = () => <TrailerComp layout={LAYOUT_16x9} />;
const Trailer9x16: React.FC = () => <TrailerComp layout={LAYOUT_9x16} />;
const Ad15x9: React.FC = () => <TrailerComp layout={LAYOUT_9x16} edit={AD15} />;
const Ad15x4: React.FC = () => <TrailerComp layout={LAYOUT_4x5} edit={AD15} />;
const Ad30x9: React.FC = () => <TrailerComp layout={LAYOUT_9x16} edit={AD30} />;
const Ad30x4: React.FC = () => <TrailerComp layout={LAYOUT_4x5} edit={AD30} />;

export const Root: React.FC = () => (
  <>
    <Composition id="Trailer16x9" component={Trailer16x9} durationInFrames={TOTAL_SECONDS * FPS} fps={FPS} width={1920} height={1080} />
    {INFOGRAPHICS.flatMap((spec) =>
      (['portrait', 'landscape', 'story'] as const).map((o) => (
        <Still
          key={`${spec.id}-${o}`}
          id={`info-${spec.id}-${o}`}
          width={SIZES[o].w}
          height={SIZES[o].h}
          component={() => <Infographic spec={spec} orientation={o} />}
        />
      )),
    )}
    <Composition id="Ad15-9x16" component={Ad15x9} durationInFrames={AD15.total * FPS} fps={FPS} width={1080} height={1920} />
    <Composition id="Ad15-4x5" component={Ad15x4} durationInFrames={AD15.total * FPS} fps={FPS} width={1080} height={1350} />
    <Composition id="Ad30-9x16" component={Ad30x9} durationInFrames={AD30.total * FPS} fps={FPS} width={1080} height={1920} />
    <Composition id="Ad30-4x5" component={Ad30x4} durationInFrames={AD30.total * FPS} fps={FPS} width={1080} height={1350} />
    <Composition id="Trailer9x16" component={Trailer9x16} durationInFrames={TOTAL_SECONDS * FPS} fps={FPS} width={1080} height={1920} />
  </>
);
