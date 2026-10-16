import type { ReactNode } from 'react';
import { decimal } from '../../core/format';
import type { Frame } from '../../core/types';
import { outputSize, type ConvOptions, type WindowStep } from './convolve';

export interface SlideFrame extends Frame {
  /** Index of the window on screen, or -1 before the first. */
  at: number;
}

const num = (v: number) => decimal(v, 2);

/** The size sentence: floor((n + 2p - k) / s) + 1, with this lesson's numbers and the real output's side. */
export function sizeSentence(n: number, k: number, o: ConvOptions, realSide: number): ReactNode {
  const formula = outputSize(n, k, o.pad, o.stride);
  return (
    <>
      Output side = floor(({n} + 2·{o.pad} − {k}) / {o.stride}) + 1 = <b>{formula}</b>; the real output is {realSide} x {realSide}.
    </>
  );
}

/** One frame before the slide and one per window; each caption quotes that window's sum. */
export function slideFrames(steps: readonly WindowStep[], n: number, k: number, o: ConvOptions, realSide: number): SlideFrame[] {
  const frames: SlideFrame[] = [
    {
      at: -1,
      say: (
        <>
          A {k} x {k} kernel{o.flip ? ' (flipped: true convolution)' : ''} slides over the {o.pad ? 'zero-padded ' : ''}image, {o.stride} {o.stride === 1 ? 'cell' : 'cells'} at a time. {sizeSentence(n, k, o, realSide)}
        </>
      ),
    },
  ];
  steps.forEach((s, i) => {
    frames.push({
      at: i,
      say: (
        <>
          Window for output cell ({s.oy + 1}, {s.ox + 1}): the nine products add up to <b>{num(s.sum)}</b>
          {o.relu ? (s.sum < 0 ? `, and ReLU clamps it to 0.` : `, and ReLU keeps it.`) : '.'}
        </>
      ),
      hold: 0.6,
    });
  });
  frames.push({
    at: steps.length - 1,
    say: (
      <>
        All {steps.length} windows done. {sizeSentence(n, k, o, realSide)}
      </>
    ),
  });
  return frames;
}
