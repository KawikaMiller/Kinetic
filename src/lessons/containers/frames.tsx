import type { ReactNode } from 'react';
import type { Frame } from '../../core/types';
import { BAD, GOOD, SLOW_BUILD_SECONDS, cacheBuild, type Change, type Instr, type LayerStatus } from './model';

export interface LayerFrame extends Frame {
  statuses: LayerStatus[];
  current: number | null;
  seconds: number;
}

/** Rebuilding a layer that takes longer than this lingers a little longer on screen. */
const LONG_STEP_SECONDS = 10;
const LONG_STEP_HOLD = 1.6;

export function buildFrames(file: Instr[], change: Change): LayerFrame[] {
  const statuses: LayerStatus[] = file.map(() => 'pending');
  const frames: LayerFrame[] = [
    {
      statuses: [...statuses], current: null, seconds: 0,
      say:
        change === 'first' ? <>First build: nothing is cached yet. Each instruction becomes a <b>layer</b>, stacked on the one below.</>
          : change === 'code' ? <>You edited <span className="hl">server.js</span> and rebuild. Which layers can Docker reuse?</>
            : <>You added a dependency to <span className="hl">package.json</span> and rebuild.</>,
    },
  ];
  const build = cacheBuild(file, change);
  file.forEach((ins, i) => {
    const { status, changed, seconds } = build[i];
    const cached = status === 'cached';
    statuses[i] = status;
    let say: ReactNode;
    if (cached) say = <><code>{ins.text}</code> → <span className="hl ok">CACHED</span>. Same instruction, same inputs, same layers underneath: reuse it.</>;
    else if (changed) say = <><code>{ins.text}</code> → its input changed, so it <span className="hl bad">rebuilds</span>… and <b>every layer above it</b> must rebuild too.</>;
    else if (change === 'first') say = <><code>{ins.text}</code> → builds the {ins.what} layer ({ins.size}, {ins.seconds}s).</>;
    else say = <><code>{ins.text}</code> → nothing about it changed, but a layer below did, so the cache is gone: <span className="hl bad">rebuild</span> ({ins.seconds}s).</>;
    frames.push({ statuses: [...statuses], current: i, seconds, say, hold: ins.seconds > LONG_STEP_SECONDS && !cached ? LONG_STEP_HOLD : 1 });
  });
  const seconds = build.length ? build[build.length - 1].seconds : 0;
  const reused = statuses.filter((s) => s === 'cached').length;
  frames.push({
    statuses: [...statuses], current: null, seconds, hold: 2,
    say: (
      <>
        Build took <span className={`hl ${seconds > SLOW_BUILD_SECONDS ? 'bad' : 'ok'}`}>{seconds.toFixed(1)}s</span> with {reused}/{file.length} layers reused.
        {file === BAD && change === 'code' ? <> Copying all the source <b>before</b> npm ci means any code edit reinstalls every dependency.</> : null}
        {file === GOOD && change === 'code' ? <> Copying package.json first keeps the slow npm ci layer cached for code-only edits.</> : null}
      </>
    ),
  });
  return frames;
}
