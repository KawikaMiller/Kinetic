import { plural } from '../../core/format';
import type { Frame } from '../../core/types';
import { ceilLog2, group, halvingSteps } from './model';

export interface HalvingFrame extends Frame {
  /** Index into the halving steps: 0 is the starting size. */
  at: number;
}

/** One frame per halving, from n down to 1. */
export function halvingFrames(n: number): { steps: number[]; frames: HalvingFrame[] } {
  const steps = halvingSteps(n);
  const total = ceilLog2(n);
  const frames: HalvingFrame[] = steps.map((v, at) => {
    if (at === 0) {
      return {
        at,
        say: <>Start with <span className="hl violet">{group(n)}</span> things. Each step keeps one half. How many steps to get
          down to one?</>,
      };
    }
    if (at === steps.length - 1) {
      return {
        at,
        hold: 2.5,
        say: <>Down to <b>1</b> after <span className="hl">{plural(total, 'halving')}</span>: that's log₂ {group(n)} rounded up.
          It's why binary search over {group(n)} sorted items needs about {total} checks, and a balanced tree of them is about
          {' '}{total} levels tall.</>,
      };
    }
    return {
      at,
      say: at === 1
        ? <>Halve: <span className="hl violet">{group(v)}</span> left. On the linear bar half the length vanished; on the log bar
            only one notch did.</>
        : <>Halving {at}: <span className="hl violet">{group(v)}</span> left. Every halving costs the same one notch on the log bar.</>,
    };
  });
  return { steps, frames };
}
