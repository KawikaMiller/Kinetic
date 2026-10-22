import { useMemo, useState, type ReactNode } from 'react';
import { ByteGrid } from '../../components/ByteGrid';
import { LogStream } from '../../components/LogStream';
import { SectionTitle } from '../../components/Panel';
import { SeedField } from '../../components/SeedField';
import { StageFrame } from '../../components/StageFrame';
import { Legend, Provenance, ProvenanceRow, Segmented, Slider, Stat, Stats } from '../../components/ui';
import { usePlayer } from '../../core/usePlayer';
import { noCrashCaption } from './captions';
import { minimiseFrames, type MinimiseFrame } from './frames';
import { MAX_EXECUTIONS, MIN_EXECUTIONS, bucketCrashes, runFuzz } from './fuzzer';
import { formatHex } from './hexInput';
import { crashesAt, minimise } from './minimise';
import { largestCrash, logRowsOf } from './model';
import { initialCrash } from './opening';
import { DEFAULT_TARGET, type BranchId } from './target';

const EXECUTIONS_STEP = 100;
const STEP_INTERVAL_MS = 700;
const LOG_HEIGHT = 190;

const n = (v: number) => v.toLocaleString('en-US');

/** Scene 3: a crash is saved, shrunk to the few bytes that matter, and sorted by where it threw. */
export function CrashScene({ picker }: { picker: ReactNode }) {
  const [state, setState] = useState(initialCrash);
  const { seed, executions } = state;
  const run = useMemo(() => runFuzz({ kind: 'guided', seed, executions, target: DEFAULT_TARGET }), [seed, executions]);
  const buckets = useMemo(() => bucketCrashes(run.crashes), [run]);
  const site = (state.site !== null && buckets.some((b) => b.site === state.site) ? state.site : buckets[0]?.site ?? null) as BranchId | null;
  const rows = useMemo(
    () =>
      buckets.map((b) => {
        const largest = largestCrash(run.crashes, b.site)!;
        const min = minimise(largest.bytes, (bytes) => crashesAt(bytes, b.site, DEFAULT_TARGET));
        return { ...b, largest, min };
      }),
    [buckets, run],
  );
  const picked = rows.find((r) => r.site === site) ?? null;
  const frames = useMemo<MinimiseFrame[]>(
    () => (picked ? minimiseFrames(run, picked.largest.bytes, picked.min, picked.site) : [{ bytes: [], chunk: null, say: noCrashCaption(run) }]),
    [picked, run],
  );
  const player = usePlayer(frames, { interval: STEP_INTERVAL_MS, autoplayOnChange: false });
  const f = player.frame;
  const logRows = useMemo(() => logRowsOf(run), [run]);
  const set = (patch: Partial<typeof state>) => setState((s) => ({ ...s, ...patch }));

  return (
    <StageFrame
      player={player}
      height={430}
      stats={
        <Stats>
          <Stat label="Crashing inputs" value={n(run.crashes.length)} color={run.crashes.length > 0 ? 'var(--bad)' : 'var(--muted)'} sub={`in ${n(executions)} executions`} />
          <Stat label="Buckets" value={buckets.length} color="var(--violet)" sub={buckets.length > 0 ? 'one per branch that threw' : 'nothing to sort'} />
          <Stat label="Smallest crash" value={picked ? `${picked.min.result.length} bytes` : '-'} color="var(--ok)" sub={picked ? `down from ${picked.largest.bytes.length}, at b${picked.site}` : undefined} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--bad)', label: 'a crashing input', shape: 'square' },
            { color: 'var(--info)', label: 'the chunk being tried', shape: 'square' },
            { color: 'var(--ok)', label: 'new coverage', shape: 'square' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          {buckets.length > 1 && site !== null && (
            <Segmented label="Minimise the largest crash of" value={site} onChange={(v) => set({ site: v })} options={buckets.map((b) => ({ value: b.site, label: `b${b.site}` }))} />
          )}
        </>,
        <>
          <Slider label="Executions" value={executions} min={MIN_EXECUTIONS} max={MAX_EXECUTIONS} step={EXECUTIONS_STEP} onChange={(v) => set({ executions: v, site: null })} format={n} />
          <SeedField seed={seed} onSeed={(v) => set({ seed: v, site: null })} />
        </>,
      ]}
    >
      <div className="fz-stage stage-pad">
        {picked ? (
          <div className="fz-block">
            <SectionTitle>
              The input being minimised ({f.bytes.length} bytes: {formatHex(f.bytes.slice(0, 8))}
              {f.bytes.length > 8 ? ' …' : ''})
            </SectionTitle>
            <ByteGrid
              bytes={f.bytes}
              perRow={8}
              toneOf={(i) => (f.chunk !== null && i >= f.chunk[0] && i < f.chunk[1] ? 'info' : 'bad')}
              ariaLabel={`Crashing input of ${f.bytes.length} bytes`}
            />
          </div>
        ) : (
          <p className="fz-note">{noCrashCaption(run)}</p>
        )}
        <div className="fz-two">
          <div className="fz-block">
            <SectionTitle>Crash buckets</SectionTitle>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Site</th>
                  <th>Crashing inputs</th>
                  <th>Largest</th>
                  <th>Minimised</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.site}>
                    <td>b{r.site}</td>
                    <td>{n(r.count)}</td>
                    <td>{r.largest.bytes.length} bytes</td>
                    <td>{r.min.result.length} bytes</td>
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={4}>No crash in this run.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="fz-block">
            <LogStream label="Fuzzer log" rows={logRows} max={40} maxHeight={LOG_HEIGHT} live="off" empty="Nothing logged." />
          </div>
        </div>
      </div>
      <ProvenanceRow>
        <Provenance kind="simulated" seed={seed}>no real program runs: everything here is the lesson's own toy</Provenance>
        <Provenance kind="toy">the crash is a thrown error in an invented parser; the minimiser is delta debugging on bytes</Provenance>
      </ProvenanceRow>
    </StageFrame>
  );
}
