import { useMemo, type ReactNode } from 'react';
import { CellGrid } from '../../components/CellGrid';
import { MetricMeter } from '../../components/MetricMeter';
import { SeedField } from '../../components/SeedField';
import { StageFrame } from '../../components/StageFrame';
import { Button, Legend, Provenance, ProvenanceRow, Segmented, Slider, Stat, Stats, Toggle } from '../../components/ui';
import { useIntroCaption } from '../../core/caption';
import { pctText } from '../../core/format';
import { poolCaption, scanCaption } from './captions';
import { DISK_PAGES, MEASURE, POLICIES, SKEW, hitRatio, scanExperiment, writeBacks, type Pool } from './pool';
import { BATCH, type PoolState } from './usePoolState';

export type PoolSceneId = 'hot' | 'scan' | 'pins';

const DISK_COLS = DISK_PAGES / 2;
const FRAME_COLUMNS = ['page', 'pins', 'dirty', 'use'];
const HIT_BANDS = [
  { upTo: 60, tone: 'bad' as const, label: 'poor' },
  { upTo: 85, tone: 'orange' as const, label: 'fair' },
  { upTo: 100, tone: 'ok' as const, label: 'good' },
];

function frameRail(pool: Pool, i: number) {
  const f = pool.frames[i];
  const hand = pool.policy !== 'lru' && pool.hand === i ? ' · hand' : '';
  if (pool.last?.frame === i) return { tone: 'hi' as const, label: `${pool.last.result}${hand}` };
  if (f.pins > 0) return { tone: 'violet' as const, label: `pinned${hand}` };
  if (f.page === null) return { tone: 'dim' as const, label: `free${hand}` };
  return hand ? { tone: 'info' as const, label: 'hand' } : null;
}

export function PoolScene({ scene, st, picker }: { scene: PoolSceneId; st: PoolState; picker: ReactNode }) {
  const { pool } = st;
  const c = pool.count;
  const ratio = hitRatio(c);
  const scanRows = useMemo(
    () => POLICIES.map((p) => ({ label: p.label, ...scanExperiment(p.value, st.seed, st.skew) })),
    [st.seed, st.skew],
  );
  useIntroCaption(scene === 'scan' ? <>{scanCaption(scanRows, MEASURE)} {poolCaption(pool)}</> : poolCaption(pool), [scene, pool, scanRows]);
  const inPool = new Set(pool.frames.flatMap((f) => (f.page === null ? [] : [f.page])));

  return (
    <StageFrame
      height={420}
      stats={
        <Stats>
          <Stat label="Hits" value={c.hits} color="var(--ok)" />
          <Stat label="Misses" value={c.misses} color="var(--bad)" sub={`${c.diskReads} disk reads`} />
          <Stat label="Write-backs" value={writeBacks(c)} color="var(--orange)" sub={`${c.dirtyEvictions} evictions, ${c.flushes} flushed`} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--hi)', label: 'frame holding the requested page' },
            { color: 'var(--ok)', label: 'hit' },
            { color: 'var(--bad)', label: 'miss' },
            { color: 'var(--violet)', label: 'pinned' },
            { color: 'var(--orange)', label: 'dirty page' },
            { color: 'var(--info)', label: 'clock hand, page in the pool' },
            { color: 'var(--dim)', label: 'free frame' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <Segmented label="Policy" value={st.policy} onChange={st.setPolicy} options={POLICIES} />
        </>,
        <>
          <SeedField seed={st.seed} onSeed={st.setSeed} />
          <Slider label="Skew" value={st.skew} min={SKEW.min} max={SKEW.max} step={0.1} onChange={st.setSkew} format={(v) => v.toFixed(1)} />
        </>,
        <>
          <Button variant="primary" onClick={() => st.serve(1)}>Run 1</Button>
          <Button variant="primary" onClick={() => st.serve(BATCH)}>Run {BATCH}</Button>
          <Toggle label="Clicking a disk page" value={st.mode === 'write'} onChange={(w) => st.setMode(w ? 'write' : 'read')} off="reads it" on="writes it" />
          {scene === 'scan' && <Button onClick={st.scan}>Run a full scan</Button>}
          {scene === 'pins' && <Button onClick={st.checkpoint}>Checkpoint</Button>}
          <Button onClick={st.reset}>Reset</Button>
        </>,
      ]}
    >
      <div className="bp-stage stage-pad">
        <MetricMeter label="Hit ratio" value={ratio === null ? null : ratio * 100} max={100} unit="%" bands={HIT_BANDS} format={(v) => pctText(v / 100, 1)} />
        <div className="bp-frames">
          <CellGrid
            rows={pool.frames.length}
            cols={FRAME_COLUMNS.length}
            size="md"
            colLabels={FRAME_COLUMNS}
            rowLabels={pool.frames.map((_, i) => `f${i}`)}
            cell={(r, col) => {
              const f = pool.frames[r];
              if (col === 0) return f.page === null ? { text: '–', tone: 'dim', fill: 'outline' } : { text: f.page, tone: 'info', fill: 'tint' };
              if (col === 1) return { text: f.pins > 0 ? f.pins : '', tone: 'violet', fill: f.pins > 0 ? 'tint' : 'none' };
              if (col === 2) return { text: f.dirty ? '●' : '', tone: 'orange', fill: f.dirty ? 'tint' : 'none' };
              return { text: pool.policy === 'lru' || f.page === null ? '' : f.usage, tone: 'muted', fill: 'none' };
            }}
            rowDecor={(r) => frameRail(pool, r)}
            onCellClick={(r, col) => col === 0 || col === 1 ? st.pin(r) : undefined}
            cellAriaLabel={(r, col) => `Frame ${r}, ${FRAME_COLUMNS[col]}: ${pool.frames[r].page === null ? 'free' : `page ${pool.frames[r].page}`}. Press to ${pool.frames[r].pins > 0 ? 'unpin' : 'pin'} it`}
            ariaLabel="Buffer pool frames"
          />
        </div>
        <div className="bp-disk">
          <span className="bp-label">Disk: click a page to request it</span>
          <CellGrid
            rows={2}
            cols={DISK_COLS}
            size="sm"
            cell={(r, col) => {
              const page = r * DISK_COLS + col;
              return { text: page, tone: 'info', fill: inPool.has(page) ? 'tint' : 'none' };
            }}
            highlight={pool.last ? [{ r: Math.floor(pool.last.page / DISK_COLS), c: pool.last.page % DISK_COLS, tone: 'hi' }] : []}
            onCellClick={(r, col) => st.click(r * DISK_COLS + col)}
            cellAriaLabel={(r, col) => `Disk page ${r * DISK_COLS + col}${inPool.has(r * DISK_COLS + col) ? ', in the pool' : ''}: request it`}
            ariaLabel="Disk pages"
          />
        </div>
        {scene === 'scan' && (
          <table className="data-table bp-scan">
            <thead><tr><th>Policy</th><th>Before the scan</th><th>After the scan</th></tr></thead>
            <tbody>
              {scanRows.map((r) => (
                <tr key={r.label}><td>{r.label}</td><td>{pctText(r.before, 0)}</td><td className={r.after < r.before ? 'is-bad' : 'is-ok'}>{pctText(r.after, 0)}</td></tr>
              ))}
            </tbody>
          </table>
        )}
        <ProvenanceRow>
          <Provenance kind="simulated" seed={st.seed}>a seeded Zipf-skewed workload over {DISK_PAGES} pages</Provenance>
          <Provenance kind="toy">a teaching model: real pools hash pages to buffers, use latches and run a background writer</Provenance>
          <Provenance kind="from-memory">the usage-count cap and the scan ring size are as remembered from PostgreSQL: check the source</Provenance>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}
