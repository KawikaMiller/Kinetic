import { useMemo, useState, type ReactNode } from 'react';
import { Bar } from '../../components/Bar';
import { CellGrid } from '../../components/CellGrid';
import { CodePanel } from '../../components/CodePanel';
import { StageFrame } from '../../components/StageFrame';
import { Hint, Legend, Slider, Stat, Stats } from '../../components/ui';
import { bytes, plural } from '../../core/format';
import { usePlayer } from '../../core/usePlayer';
import { makeParts, stateCounts, uploadFrames, uploadRequests } from './frames';
import { bytesAt, checkParts, clampFailPart, CONCURRENCY, MIN_PART, partStatesAt, schedule, type PartState } from './multipart';
import { FILE_SIZE, MIB } from './store';

const STEP_MS = 420;
const SEED = 11;
const GRID_COLS = 10;
const REQUEST_LINES = 9;
const DEFAULT_PART_MIB = 8;

const STATE_CELL: Record<PartState, { tone: 'dim' | 'info' | 'bad' | 'hi' | 'ok'; fill: 'outline' | 'tint' | 'solid' }> = {
  pending: { tone: 'dim', fill: 'outline' },
  uploading: { tone: 'info', fill: 'tint' },
  failed: { tone: 'bad', fill: 'solid' },
  retrying: { tone: 'hi', fill: 'tint' },
  done: { tone: 'ok', fill: 'solid' },
};

export function MultipartScene({ picker }: { picker: ReactNode }) {
  const [partMib, setPartMib] = useState(DEFAULT_PART_MIB);
  const [failPart, setFailPart] = useState(0);
  const parts = useMemo(() => makeParts(partMib * MIB), [partMib]);
  const failing = failPart > 0 ? failPart : null;
  const changePartSize = (mib: number) => {
    setPartMib(mib);
    setFailPart((f) => clampFailPart(f, makeParts(mib * MIB).length));
  };
  const attempts = useMemo(() => schedule(parts, { failPart: failing, seed: SEED }), [parts, failing]);
  const frames = useMemo(() => uploadFrames(parts, attempts), [parts, attempts]);
  const player = usePlayer(frames, { interval: STEP_MS });
  const { t, complete } = player.frame;
  const states = partStatesAt(parts, attempts, t);
  const counts = stateCounts(parts, attempts, t);
  const sent = bytesAt(parts, attempts, t);
  const check = checkParts(parts);
  const lines = uploadRequests(parts, attempts, t, complete).slice(-REQUEST_LINES);
  const rows = Math.ceil(parts.length / GRID_COLS);

  return (
    <StageFrame
      player={player}
      height={420}
      stats={
        <Stats>
          <Stat label="Parts" value={parts.length} sub={`${partMib} MiB each`} />
          <Stat label="In flight" value={counts.uploading} sub={`of ${CONCURRENCY} connections`} color={counts.uploading > 0 ? 'var(--info)' : undefined} />
          <Stat label="Done" value={counts.done} color="var(--ok)" />
          <Stat label="Bytes sent" value={bytes(sent.sent)} sub={sent.wasted > 0 ? `${bytes(sent.wasted)} wasted on a failed part` : 'nothing wasted'} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--info)', label: 'uploading' },
            { color: 'var(--bad)', label: 'failed' },
            { color: 'var(--hi)', label: 'retrying' },
            { color: 'var(--ok)', label: 'done' },
            { color: 'var(--dim)', label: 'waiting' },
          ]}
        />
      }
      controls={[
        picker,
        <>
          <Slider label="Part size" value={partMib} min={1} max={16} onChange={changePartSize} format={(v) => `${v} MiB`} />
          <Slider
            label="Fail part"
            value={failPart}
            min={0}
            max={parts.length}
            onChange={setFailPart}
            format={(v) => (v === 0 ? 'none' : `#${v}`)}
          />
        </>,
      ]}
    >
      <div className="os stage-pad">
        <div className="os-upload">
          <CellGrid
            rows={rows}
            cols={GRID_COLS}
            size={{ cell: 34, gap: 4, font: 12 }}
            ariaLabel={`${plural(parts.length, 'part')} of the upload`}
            cell={(r, c) => {
              const i = r * GRID_COLS + c;
              if (i >= parts.length) return { fill: 'none' };
              return { ...STATE_CELL[states[i]], text: i + 1 };
            }}
            cellTitle={(r, c) => {
              const i = r * GRID_COLS + c;
              return i < parts.length ? `Part ${i + 1}: ${states[i]}, ${bytes(parts[i].size)}` : '';
            }}
          />
          <div className="os-progress">
            <Bar value={sent.done} max={FILE_SIZE} tone="ok" label={`${bytes(sent.done)} of ${bytes(FILE_SIZE)} in finished parts`} />
            <p className={check.ok ? 'hint' : 'os-error'}>
              {check.ok
                ? `Every part but the last is at least the ${MIN_PART / MIB} MiB minimum, so Complete will succeed.`
                : `Parts are under the ${MIN_PART / MIB} MiB minimum: Complete will be refused (only the last part may be small).`}
            </p>
          </div>
        </div>
        <CodePanel title="HTTP to the object store (last requests)" lines={lines} gutter="none" active={lines.length - 1} />
        <Hint block>
          Simulated upload: four connections at an illustrative 2 MiB/s each, with seeded jitter, so parts finish out of order. The 5 MiB minimum part size, the 10,000-part limit and the API shape follow
          the common S3-compatible convention, and other services differ.
        </Hint>
      </div>
    </StageFrame>
  );
}
