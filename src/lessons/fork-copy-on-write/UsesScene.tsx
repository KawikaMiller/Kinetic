import { useState, type ReactNode } from 'react';
import { Bar } from '../../components/Bar';
import { Box, SectionTitle } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { ChipButton, Hint, Legend, Provenance, ProvenanceRow, Slider, Stat, Stats, Toggle } from '../../components/ui';
import { bytes } from '../../core/format';
import { HUGE_PAGE_BYTES, PAGE_BYTES } from './mmu';
import { DEFAULT_USES, usesView, type Preset, type UsesState } from './usesView';
import { MAX_SNAPSHOT_WRITES, MAX_WORKERS, SERVER_DATA_START, SERVER_PAGES } from './uses';

const PRESETS: { id: Preset; label: string }[] = [
  { id: 'snapshot', label: 'Redis-style snapshot' },
  { id: 'prefork', label: 'Pre-fork server' },
  { id: 'exec', label: 'fork then exec' },
];
const MAX_WORKER_WRITES = SERVER_PAGES - SERVER_DATA_START;
const SNAPSHOT_WRITE_STEP = 32;

export function UsesScene({ picker }: { picker: ReactNode }) {
  const [s, setS] = useState<UsesState>(DEFAULT_USES);
  const v = usesView(s);
  const set = (patch: Partial<UsesState>) => setS((x) => ({ ...x, ...patch }));

  return (
    <StageFrame
      height={400}
      intro={v.caption}
      introKey={[v.caption]}
      stats={
        <Stats>
          {v.stats.map((st) => <Stat key={st.label} label={st.label} value={st.value} sub={st.sub} />)}
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--muted)', label: 'memory that was there before the fork', shape: 'square' },
            { color: 'var(--bad)', label: 'the costly side: growth above the pre-fork baseline, or what a naive fork needs', shape: 'square' },
            { color: 'var(--ok)', label: 'what copy-on-write actually uses', shape: 'square' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          {PRESETS.map((p) => <ChipButton key={p.id} tone="violet" size="md" on={s.preset === p.id} onClick={() => set({ preset: p.id })}>{p.label}</ChipButton>)}
        </>,
        <>
          {s.preset === 'snapshot' && (
            <>
              <Slider label="Parent writes while the child lives" value={s.snapshotWrites} min={0} max={MAX_SNAPSHOT_WRITES} step={SNAPSHOT_WRITE_STEP} onChange={(snapshotWrites) => set({ snapshotWrites })} />
              <Toggle label="Page size" value={s.huge} onChange={(huge) => set({ huge })} off="4 KB" on="2 MB huge pages" />
            </>
          )}
          {s.preset === 'prefork' && (
            <>
              <Slider label="Workers" value={s.workers} min={1} max={MAX_WORKERS} onChange={(workers) => set({ workers })} />
              <Slider label="Private pages written per worker" value={s.workerWrites} min={0} max={MAX_WORKER_WRITES} onChange={(workerWrites) => set({ workerWrites })} />
            </>
          )}
          {s.preset === 'exec' && <Hint tone="muted">Nothing to set: the child execs before it writes.</Hint>}
        </>,
      ]}
    >
      <div className="fk-stage stage-pad">
        <Box>
          <SectionTitle hint="two things in one unit, so the bars compare like with like">{PRESETS.find((p) => p.id === s.preset)!.label}</SectionTitle>
          <div className="fk-bars">
            {v.bars.map((b) => (
              <div key={b.label}>
                <span className="fk-barlabel">{b.label}: {b.unit === 'bytes' ? bytes(b.value, { dp: 1 }) : b.value}</span>
                <Bar value={b.value} max={v.barMax} tone={b.tone === 'muted' ? undefined : b.tone} color={b.tone === 'muted' ? 'var(--muted)' : undefined} height={12} animate={false} ariaLabel={`${b.label}: ${b.value} ${b.unit}`} />
              </div>
            ))}
          </div>
          {s.preset === 'snapshot' && (
            <Hint tone="muted" block>
              The data set is 8 MB: {(8 * 1024 * 1024) / PAGE_BYTES} pages of 4 KB, or {(8 * 1024 * 1024) / HUGE_PAGE_BYTES} huge pages of 2 MB. A write copies a whole page, so with huge pages a few writes copy the whole data set.
            </Hint>
          )}
        </Box>
        <ProvenanceRow>
          <Provenance kind="toy">scaled-down address spaces ({SERVER_PAGES} pages for the server, 8 MB for the snapshot); the model is the one in the first two scenes</Provenance>
          <Provenance kind="simulated" seed={21}>the snapshot parent writes to uniformly random pages</Provenance>
          <Provenance kind="from-memory">Redis forks a child to write its snapshot while the parent keeps serving, pre-fork servers share loaded code, and transparent huge pages behave differently from system to system: check the Redis docs, man 2 fork and the kernel docs</Provenance>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}
