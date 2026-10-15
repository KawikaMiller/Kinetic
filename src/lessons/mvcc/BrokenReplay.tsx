import { useMemo, useState, type ReactNode } from 'react';
import { StageFrame } from '../../components/StageFrame';
import { Button, Hint, Legend, Provenance, ProvenanceRow, Stat, Stats } from '../../components/ui';
import { usePlayer } from '../../core/usePlayer';
import type { Frame } from '../../core/types';
import { opText } from './captions';
import { removable, snapshotViolations, txOf, visible, type Db } from './engine';
import { BROKEN_SEED, counterexample } from './schedule';
import { VersionTable } from './VersionTable';
import type { RowView } from './view';

interface ReplayFrame extends Frame {
  db: Db;
  /** The slot whose view the table shows. */
  viewer: 1 | 2 | 3;
  /** The version rails to draw instead of the computed ones, for the frame just before the broken VACUUM runs. */
  override: ReadonlyMap<number, RowView> | null;
}

const PLAYER_INTERVAL_MS = 1100;

/** The pinned counterexample as frames: every operation the schedule ran, then the broken VACUUM's before and after. */
function replayFrames(): { frames: ReplayFrame[]; slot: 1 | 2 | 3; message: string } {
  const trace = counterexample();
  const last = trace.steps.at(-1)!;
  const slot = snapshotViolationSlot(last.before, last.db);
  const frames: ReplayFrame[] = trace.steps.slice(0, -1).map((s) => ({ db: s.db, viewer: slot, override: null, say: <>{opText(s.op)}: {s.outcome.message}.</> }));
  const doomed = removable(last.before, true);
  const victim = txOf(last.before, slot)!;
  const readable = new Set(doomed.filter((v) => visible(last.before, v, victim.xid, victim.snapshot!)).map((v) => v.vid));
  const override = new Map<number, RowView>(
    doomed.map((v) => [v.vid, readable.has(v.vid) ? { tone: 'bad', label: `T${slot} still reads this: broken VACUUM removes it` } : { tone: 'bad', label: 'dead: removed' }]),
  );
  frames.push({ db: last.before, viewer: slot, override, say: <>The broken VACUUM uses the latest commit as its horizon instead of the oldest open snapshot, so it will remove every version with a committed deleter: the red rows, including one T{slot} can still read.</> });
  frames.push({ db: last.db, viewer: slot, override: null, say: <><span className="hl bad">{last.violation}</span>. The same SELECT now returns a different answer inside one transaction: the safety invariant is violated.</> });
  return { frames, slot, message: last.violation! };
}

const snapshotViolationSlot = (before: Db, after: Db): 1 | 2 | 3 => snapshotViolations(before, after)[0].slot as 1 | 2 | 3;

/** The counterexample the learner gets when they turn the broken VACUUM on: the real engine, a pinned seed, stepped by a player. */
export function BrokenReplay({ picker, onBack }: { picker: ReactNode; onBack: () => void }) {
  const { frames, slot, message } = useMemo(() => replayFrames(), []);
  const [back, setBack] = useState(0);
  const player = usePlayer(frames, { interval: PLAYER_INTERVAL_MS, autoplayOnChange: false });
  const f = player.frame;
  return (
    <StageFrame
      player={player}
      height={360}
      stats={
        <Stats>
          <Stat label="Seed" value={BROKEN_SEED} sub="the lowest of 1 to 200 that breaks it" />
          <Stat label="Table shown as" value={`T${slot}`} color="var(--info)" sub={`${player.index + 1} of ${frames.length} steps`} />
        </Stats>
      }
      legend={<Legend items={[{ color: 'var(--ok)', label: `visible to T${slot}` }, { color: 'var(--dim)', label: 'not visible' }, { color: 'var(--bad)', label: 'dead, or removed by the broken VACUUM' }]} />}
      controls={[
        <>
          {picker}
          <Button onClick={onBack}>Back to the correct VACUUM</Button>
          <Hint tone="muted">This is a replay of a seeded schedule through the real engine with the broken horizon: {message}.</Hint>
        </>,
      ]}
    >
      <div className="mv-stage stage-pad">
        <VersionTable db={f.db} who={f.viewer} back={back} onBack={setBack} rowOverride={(vid) => f.override?.get(vid) ?? null} />
        <ProvenanceRow>
          <Provenance kind="simulated" seed={BROKEN_SEED}>the same engine, a seeded random schedule; nothing here is scripted</Provenance>
          <Provenance kind="toy">a deliberately broken VACUUM: it is a bug the lesson plants, not how any database works</Provenance>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}
