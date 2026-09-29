import { motion } from 'motion/react';
import { useMemo, useState, type CSSProperties } from 'react';
import { StageFrame } from '../../components/StageFrame';
import { Button, Controls, Legend, Slider, Stat, Stats } from '../../components/ui';
import { randInt } from '../../core/hooks';
import type { Frame } from '../../core/types';
import { usePlayer } from '../../core/usePlayer';
import './styles.css';

interface BinState {
  lo: number;
  hi: number;
  mid: number | null;
  checks: number;
  found: boolean;
  done: boolean;
}

interface LinState {
  idx: number | null;
  checks: number;
  found: boolean;
  done: boolean;
}

interface BsFrame extends Frame {
  bin: BinState;
  lin: LinState;
}

function makeArray(n: number) {
  const set = new Set<number>();
  while (set.size < n) set.add(randInt(1, n * 3));
  return [...set].sort((a, b) => a - b);
}

function missingValue(arr: number[]) {
  const have = new Set(arr);
  const gaps: number[] = [];
  for (let v = arr[0] + 1; v < arr[arr.length - 1]; v++) if (!have.has(v)) gaps.push(v);
  return gaps.length ? gaps[randInt(0, gaps.length - 1)] : arr[arr.length - 1] + 1;
}

function buildFrames(arr: number[], target: number): BsFrame[] {
  const n = arr.length;

  // Binary search trace: one entry per comparison.
  const bin: { lo: number; hi: number; mid: number; cmp: number }[] = [];
  let lo = 0;
  let hi = n - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const cmp = Math.sign(arr[mid] - target);
    bin.push({ lo, hi, mid, cmp });
    if (cmp === 0) break;
    if (cmp < 0) lo = mid + 1;
    else hi = mid - 1;
  }
  const binFound = bin[bin.length - 1]?.cmp === 0;

  const linIdx = arr.indexOf(target);
  const linSteps = linIdx >= 0 ? linIdx + 1 : n;
  const total = Math.max(bin.length, linSteps);

  const frames: BsFrame[] = [
    {
      bin: { lo: 0, hi: n - 1, mid: null, checks: 0, found: false, done: false },
      lin: { idx: null, checks: 0, found: false, done: false },
      say: (
        <>
          Find <span className="hl">{target}</span> in {n} sorted numbers. Top row checks one by one; bottom row
          checks the middle and throws away half. Press play.
        </>
      ),
    },
  ];

  for (let k = 1; k <= total; k++) {
    const b = bin[k - 1];
    const binState: BinState = b
      ? { lo: b.lo, hi: b.hi, mid: b.mid, checks: k, found: b.cmp === 0, done: b.cmp === 0 || k === bin.length }
      : { ...frames[k - 1].bin, done: true };
    if (!b && !binFound) binState.mid = null;

    const linDone = k >= linSteps;
    const linState: LinState = {
      idx: Math.min(k, linSteps) - 1,
      checks: Math.min(k, linSteps),
      found: linDone && linIdx >= 0,
      done: linDone,
    };

    let say;
    if (b) {
      const v = arr[b.mid];
      if (b.cmp === 0) {
        say = (
          <>
            Binary checks the middle: <span className="hl ok">{v}</span>. Found it in <b>{k}</b>{' '}
            {k === 1 ? 'check' : 'checks'}.
          </>
        );
      } else {
        const left = b.cmp < 0 ? b.hi - b.mid : b.mid - b.lo;
        say = (
          <>
            Middle is <span className="hl">{v}</span>, {b.cmp < 0 ? 'smaller' : 'bigger'} than {target}. So
            everything to the <b>{b.cmp < 0 ? 'left' : 'right'}</b> is out.{' '}
            {left > 0 ? (
              <>
                <b>{left}</b> left to search.
              </>
            ) : (
              <>Nothing left: {target} isn't here.</>
            )}
          </>
        );
      }
    } else {
      say = (
        <>
          Binary finished after <b>{bin.length}</b>. Linear is still plodding along: check{' '}
          <b>#{linState.checks}</b>…
        </>
      );
    }

    frames.push({ bin: binState, lin: linState, say });
  }

  const last = frames[frames.length - 1];
  last.hold = 2;
  last.say =
    linIdx >= 0 ? (
      <>
        Linear: <span className="hl bad">{linSteps} checks</span>. Binary:{' '}
        <span className="hl ok">{bin.length}</span>. With a million items that gap becomes up to 1,000,000 vs 20.
      </>
    ) : (
      <>
        {target} isn't in the array. Linear had to look at <span className="hl bad">all {n}</span>; binary proved it
        in <span className="hl ok">{bin.length}</span>.
      </>
    );

  return frames;
}

export function Stage() {
  const [data, setData] = useState(() => {
    const arr = makeArray(24);
    return { arr, target: arr[randInt(0, arr.length - 1)] };
  });
  const { arr, target } = data;
  const frames = useMemo(() => buildFrames(arr, target), [arr, target]);
  const player = usePlayer(frames, { interval: 850 });
  const { bin, lin } = player.frame;
  const n = arr.length;

  const resize = (size: number) => {
    const next = makeArray(size);
    setData({ arr: next, target: next[randInt(0, size - 1)] });
  };

  const worst = Math.ceil(Math.log2(n + 1));
  const fontSize = n > 32 ? 10 : n > 20 ? 12 : 15;

  return (
    <StageFrame
      player={player}
      height={380}
      stats={
        <Stats>
          <Stat label="Target" value={target} color="var(--hi)" />
          <Stat label="Linear checks" value={lin.checks} color="var(--bad)" sub={`worst case ${n}`} />
          <Stat label="Binary checks" value={bin.checks} color="var(--ok)" sub={`worst case ${worst}`} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--hi)', label: 'checking now' },
            { color: 'rgb(255 209 102 / 0.25)', label: 'still possible' },
            { color: 'var(--dim)', label: 'ruled out' },
            { color: 'var(--ok)', label: 'found' },
          ]}
        />
      }
      controls={
        <Controls>
          <Slider label="Array size" value={n} min={8} max={40} onChange={resize} />
          <Button onClick={() => resize(n)}>New array</Button>
          <Button onClick={() => setData({ arr, target: missingValue(arr) })}>Search for a missing value</Button>
          <span className="bs-hint">…or click any number to search for it</span>
        </Controls>
      }
    >
      <div className="bs" style={{ '--n': n, '--fs': `${fontSize}px` } as CSSProperties}>
        <Row
          title="Linear search"
          tag="O(n)"
          tagColor="var(--bad)"
          arr={arr}
          onPick={(v) => setData({ arr, target: v })}
          cellClass={(i) => {
            if (lin.idx === null) return '';
            if (i === lin.idx) return lin.found ? 'found' : 'mid';
            return i < lin.idx ? 'out' : '';
          }}
          pointer={lin.idx}
          pointerLabel="i"
        />
        <Row
          title="Binary search"
          tag="O(log n)"
          tagColor="var(--ok)"
          arr={arr}
          onPick={(v) => setData({ arr, target: v })}
          cellClass={(i) => {
            if (bin.checks === 0) return '';
            if (i === bin.mid) return bin.found ? 'found' : 'mid';
            if (bin.done && !bin.found) return 'out';
            return i < bin.lo || i > bin.hi ? 'out' : 'live';
          }}
          band={bin.checks === 0 || (bin.done && !bin.found) ? null : [bin.lo, bin.hi]}
          pointer={bin.mid}
          pointerLabel="mid"
        />
      </div>
    </StageFrame>
  );
}

function Row({
  title, tag, tagColor, arr, cellClass, onPick, band, pointer, pointerLabel,
}: {
  title: string;
  tag: string;
  tagColor: string;
  arr: number[];
  cellClass: (i: number) => string;
  onPick: (v: number) => void;
  band?: [number, number] | null;
  pointer: number | null;
  pointerLabel: string;
}) {
  const n = arr.length;
  const pct = (i: number) => `${(i / n) * 100}%`;
  const spring = { type: 'spring', stiffness: 260, damping: 28 } as const;

  return (
    <div className="bs-row">
      <div className="bs-row-head">
        <span>{title}</span>
        <span className="bs-tag" style={{ color: tagColor, borderColor: tagColor }}>
          {tag}
        </span>
      </div>
      <div className="bs-track">
        {band && (
          <motion.div
            className="bs-band"
            initial={false}
            animate={{ left: pct(band[0]), width: `${((band[1] - band[0] + 1) / n) * 100}%` }}
            transition={spring}
          >
            <span className="bs-band-lo">lo</span>
            <span className="bs-band-hi">hi</span>
          </motion.div>
        )}
        <div className="bs-cells">
          {arr.map((v, i) => (
            <button key={i} type="button" className={`bs-cell ${cellClass(i)}`} onClick={() => onPick(v)} title={`Search for ${v}`}>
              {v}
            </button>
          ))}
        </div>
        {pointer !== null && (
          <motion.div
            className="bs-pointer"
            initial={false}
            animate={{ left: `${((pointer + 0.5) / n) * 100}%` }}
            transition={spring}
          >
            ▲<span>{pointerLabel}</span>
          </motion.div>
        )}
      </div>
    </div>
  );
}
