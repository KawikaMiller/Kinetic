import type { ReactNode } from 'react';
import type { Frame } from '../../core/types';

/** One Dockerfile instruction and what building its layer costs. */
export interface Instr {
  text: string;
  /** Which inputs this instruction depends on beyond the instruction text. */
  inputs: ('base' | 'deps' | 'code')[];
  seconds: number;
  size: string;
  what: string;
}

/** Copies the dependency list first, so the slow `npm ci` layer survives code edits. */
export const GOOD: Instr[] = [
  { text: 'FROM node:20-slim', inputs: ['base'], seconds: 8, size: '180 MB', what: 'base image' },
  { text: 'WORKDIR /app', inputs: [], seconds: 0.1, size: '0 B', what: 'working dir' },
  { text: 'COPY package*.json ./', inputs: ['deps'], seconds: 0.2, size: '2 KB', what: 'dependency list' },
  { text: 'RUN npm ci', inputs: [], seconds: 45, size: '95 MB', what: 'node_modules' },
  { text: 'COPY . .', inputs: ['deps', 'code'], seconds: 0.5, size: '1.2 MB', what: 'your source' },
  { text: 'CMD ["node", "server.js"]', inputs: [], seconds: 0, size: '0 B', what: 'metadata only' },
];

/** Copies all the source before installing, so any code edit reinstalls every dependency. */
export const BAD: Instr[] = [GOOD[0], GOOD[1], GOOD[4], GOOD[3], GOOD[5]];

export type Change = 'first' | 'code' | 'deps';
export type LayerStatus = 'pending' | 'cached' | 'built';

export interface LayerFrame extends Frame {
  statuses: LayerStatus[];
  current: number | null;
  seconds: number;
}

/** Builds slower than this read as "slow" (red) in the stats and the summary. */
export const SLOW_BUILD_SECONDS = 20;
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
  let missed = change === 'first';
  let seconds = 0;
  file.forEach((ins, i) => {
    const changed = change !== 'first' && ins.inputs.includes(change);
    if (changed) missed = true;
    const cached = !missed;
    statuses[i] = cached ? 'cached' : 'built';
    if (!cached) seconds += ins.seconds;
    let say: ReactNode;
    if (cached) say = <><code>{ins.text}</code> → <span className="hl ok">CACHED</span>. Same instruction, same inputs, same layers underneath: reuse it.</>;
    else if (changed) say = <><code>{ins.text}</code> → its input changed, so it <span className="hl">rebuilds</span>… and <b>every layer above it</b> must rebuild too.</>;
    else if (change === 'first') say = <><code>{ins.text}</code> → builds the {ins.what} layer ({ins.size}, {ins.seconds}s).</>;
    else say = <><code>{ins.text}</code> → nothing about it changed, but a layer below did, so the cache is gone: <span className="hl bad">rebuild</span> ({ins.seconds}s).</>;
    frames.push({ statuses: [...statuses], current: i, seconds, say, hold: ins.seconds > LONG_STEP_SECONDS && !cached ? LONG_STEP_HOLD : 1 });
  });
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
