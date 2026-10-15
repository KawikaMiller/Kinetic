import { useMemo, useState, type ReactNode } from 'react';
import { Box, SectionTitle } from '../../components/Panel';
import { SequenceDiagram } from '../../components/SequenceDiagram';
import { StageFrame } from '../../components/StageFrame';
import { Button, Hint, Legend, Provenance, ProvenanceRow, Segmented, Slider, Stat, Stats } from '../../components/ui';
import { PHONE_QUERY, useMediaQuery } from '../../components/useMediaQuery';
import { useIntroCaption } from '../../core/caption';
import { toSequence } from '../../core/distSim';
import { SeedField } from '../distributions/SeedField';
import { MODE_NAME, registerCaption } from './captions';
import { DEFAULT_REGISTER, canHoldStale, REG_MODES, REPLICAS, runRegister, visibleTrace, vvText, type RegMode, type RegMsg, type Resolve, type Version } from './register';

const MODE_OPTIONS = REG_MODES.map((m) => ({ value: m, label: MODE_NAME[m] }));
const RESOLVE_OPTIONS: { value: Resolve; label: string }[] = [
  { value: 'merge', label: 'Merge both' },
  { value: 'pick-a', label: 'Pick a' },
  { value: 'pick-b', label: 'Pick b' },
];
const ACTORS = [{ id: 'client', label: 'client' }, ...REPLICAS.map((r) => ({ id: r, label: r }))];

const label = (p: RegMsg): string =>
  p.type === 'put' ? `write ${p.id}` : p.type === 'resolve' ? 'resolve' : `copy ${p.version.id}${p.version.deps.length ? ` (after ${p.version.deps.join(', ')})` : ''}`;

const dominates = (x: Version, y: Version): boolean => Object.entries(y.vv).every(([k, n]) => (x.vv[k] ?? 0) >= n);

export function RegisterScene({ picker }: { picker: ReactNode }) {
  const [mode, setMode] = useState<RegMode>('lww');
  const [resolve, setResolve] = useState<Resolve>(DEFAULT_REGISTER.resolve);
  const [seed, setSeed] = useState<number>(DEFAULT_REGISTER.seed);
  const [at, setAt] = useState<number | null>(null);
  // The time notes under the arrows would render under 8px on a phone; the replay slider carries the time.
  const phone = useMediaQuery(PHONE_QUERY);

  const run = useMemo(() => runRegister({ seed, mode, resolve }), [seed, mode, resolve]);
  const last = run.frames.length - 1;
  const index = at === null ? last : Math.min(at, last);
  const frame = run.frames[index];
  const first = run.frames.findIndex((f) => f.violation !== null);
  const widest = Math.max(0, ...run.frames.slice(0, index + 1).flatMap((f) => Object.values(f.replicas).flatMap((vs) => vs.map((v) => Object.keys(v.vv).length))));
  const sequence = useMemo(
    () => toSequence(visibleTrace(run.trace, mode).filter((r) => r.t <= frame.t), { actors: ACTORS, label, events: false, times: !phone }),
    [run, mode, frame.t, phone],
  );

  useIntroCaption(registerCaption({ mode, seed, frame, widest }), [mode, resolve, seed, index]);

  return (
    <StageFrame
      height={420}
      stats={
        <Stats>
          <Stat label="Invariants" value={frame.violation ? '✗ broken' : '✓ hold so far'} color={frame.violation ? 'var(--bad)' : 'var(--ok)'} sub={frame.violation ?? 'checked after every event'} />
          <Stat label="Writes silently lost" value={frame.lost.length} color={frame.lost.length > 0 ? 'var(--bad)' : undefined} sub="seen, dropped, and nothing that survives came after them" />
          {mode !== 'lww' && <Stat label="Largest vector" value={`${widest} ${widest === 1 ? 'entry' : 'entries'}`} sub="one counter per replica that coordinated a write" />}
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--ok)', label: 'a version a replica keeps' },
            ...(canHoldStale(mode) ? [{ color: 'var(--orange)', label: 'a kept version that a newer one makes stale' }] : []),
            { color: 'var(--bad)', label: 'a write the replica threw away' },
            { color: 'var(--info)', label: 'a message', shape: 'line' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <Segmented label="Register" value={mode} onChange={(m) => { setMode(m); setAt(null); }} options={MODE_OPTIONS} />
          {mode !== 'lww' && <Segmented label="A client resolves by" value={resolve} onChange={(r) => { setResolve(r); setAt(null); }} options={RESOLVE_OPTIONS} />}
        </>,
        <>
          <SeedField seed={seed} onSeed={(s) => { setSeed(s); setAt(null); }} />
          <Slider label="Replay to" value={index} min={0} max={last} format={(v) => `${run.frames[v].t.toFixed(0)} ms`} onChange={setAt} />
          <Button disabled={first < 0} onClick={() => setAt(first)}>Jump to the first violation</Button>
        </>,
      ]}
    >
      <div className="lc-stage stage-pad">
        <div className="lc-replicas">
          {REPLICAS.map((r) => {
            const versions = frame.replicas[r] ?? [];
            return (
              <Box key={r} className="lc-replica">
                <SectionTitle>{r}</SectionTitle>
                <div className="lc-versions">
                  {versions.length === 0 && <span className="muted">empty</span>}
                  {versions.map((v) => {
                    const stale = versions.some((w) => w.id !== v.id && dominates(w, v));
                    return (
                      <span key={v.id} className={`chip lc-version tone-${stale ? 'orange' : 'ok'}`}>
                        <b>{v.value}</b> {mode === 'lww' ? `L${v.lamport}` : vvText(v.vv)}
                      </span>
                    );
                  })}
                  {frame.lost.filter((l) => l.replica === r).map((l) => (
                    <span key={l.write} className="chip lc-version is-lost tone-bad">write {l.write} lost</span>
                  ))}
                </div>
              </Box>
            );
          })}
        </div>
        <Box>
          <SectionTitle hint="every message so far">The messages</SectionTitle>
          <SequenceDiagram actors={ACTORS} messages={sequence.messages} ariaLabel="Writes, copies and the resolution" />
        </Box>
        {mode === 'no-prune' && <Hint tone="muted">Never pruning keeps every ancestor, so the sibling set fills with versions a newer one already replaced.</Hint>}
        <ProvenanceRow>
          <Provenance kind="simulated" seed={seed}>three replicas on the distSim harness, delay only; two writes before any copy can arrive, then a resolution</Provenance>
          <Provenance kind="toy">a teaching register, not a database; mitigations such as dotted version vectors are not modelled</Provenance>
          <Provenance kind="from-memory">keeping concurrent versions as siblings is the approach of Dynamo-style stores; check the Dynamo paper</Provenance>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}
