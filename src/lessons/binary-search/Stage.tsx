import { useMemo, useState } from 'react';
import { ArrayStrip, type ArrayCellState } from '../../components/ArrayStrip';
import { StageFrame } from '../../components/StageFrame';
import { Button, Controls, Hint, Legend, Slider, Stat, Stats } from '../../components/ui';
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
  const fontSize = fontSizeFor(n);

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
      <div className="bs">
        <Row
          title="Linear search"
          tag="O(n)"
          tagColor="var(--bad)"
          arr={arr}
          fontSize={fontSize}
          onPick={searchFor}
          cellState={(i) => {
            if (lin.idx === null) return 'idle';
            if (i === lin.idx) return lin.found ? 'done' : 'active';
            return i < lin.idx ? 'dim' : 'idle';
          }}
          pointer={lin.idx}
          pointerLabel="i"
        />
        <Row
          title="Binary search"
          tag="O(log n)"
          tagColor="var(--ok)"
          arr={arr}
          fontSize={fontSize}
          onPick={searchFor}
          cellState={(i) => {
            if (bin.checks === 0) return 'idle';
            if (i === bin.mid) return bin.found ? 'done' : 'active';
            if (bin.done && !bin.found) return 'dim';
            // idle cells inside the lo..hi range get ArrayStrip's "still possible" tint
            return i < bin.lo || i > bin.hi ? 'dim' : 'idle';
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
  title, tag, tagColor, arr, fontSize, cellState, onPick, band, pointer, pointerLabel,
}: {
  title: string;
  tag: string;
  tagColor: string;
  arr: number[];
  fontSize: number;
  cellState: (i: number) => ArrayCellState;
  onPick: (v: number) => void;
  band?: [number, number] | null;
  pointer: number | null;
  pointerLabel: string;
}) {
  return (
    <div className="bs-row">
      <div className="bs-row-head">
        <span>{title}</span>
        <span className="bs-tag" style={{ color: tagColor, borderColor: tagColor }}>
          {tag}
        </span>
      </div>
      <ArrayStrip
        values={arr}
        fontSize={fontSize}
        cellState={cellState}
        ranges={band ? [{ from: band[0], to: band[1], labels: ['lo', 'hi'] }] : []}
        pointers={pointer !== null ? [{ i: pointer, label: pointerLabel }] : []}
        onCellClick={(i) => onPick(arr[i])}
        cellTitle={(i) => `Search for ${arr[i]}`}
      />
    </div>
  );
}
