import { motion } from 'motion/react';
import { useMemo, useState, type CSSProperties } from 'react';
import { StageFrame } from '../../components/StageFrame';
import { Button, Controls, Hint, Legend, Slider, Stat, Stats } from '../../components/ui';
import { SPRING } from '../../core/motion';
import { randInt } from '../../core/random';
import { usePlayer } from '../../core/usePlayer';
import { buildFrames, makeArray, missingValue } from './frames';
import './styles.css';

const INITIAL_SIZE = 24;
const MIN_SIZE = 8;
const MAX_SIZE = 40;

/** Cell font size shrinks as the row gets more crowded. */
const fontSizeFor = (n: number) => (n > 32 ? 10 : n > 20 ? 12 : 15);

export function Stage() {
  const [data, setData] = useState(() => {
    const arr = makeArray(INITIAL_SIZE);
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
  const searchFor = (v: number) => setData({ arr, target: v });

  const worst = Math.ceil(Math.log2(n + 1));

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
            { color: 'color-mix(in srgb, var(--hi) 25%, transparent)', label: 'still possible' },
            { color: 'var(--dim)', label: 'ruled out' },
            { color: 'var(--ok)', label: 'found' },
          ]}
        />
      }
      controls={
        <Controls>
          <Slider label="Array size" value={n} min={MIN_SIZE} max={MAX_SIZE} onChange={resize} />
          <Button onClick={() => resize(n)}>New array</Button>
          <Button onClick={() => setData({ arr, target: missingValue(arr) })}>Search for a missing value</Button>
          <Hint>…or click any number to search for it</Hint>
        </Controls>
      }
    >
      <div className="bs" style={{ '--n': n, '--fs': `${fontSizeFor(n)}px` } as CSSProperties}>
        <Row
          title="Linear search"
          tag="O(n)"
          tagColor="var(--bad)"
          arr={arr}
          onPick={searchFor}
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
          onPick={searchFor}
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
            transition={SPRING.snappy}
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
            transition={SPRING.snappy}
          >
            ▲<span>{pointerLabel}</span>
          </motion.div>
        )}
      </div>
    </div>
  );
}
