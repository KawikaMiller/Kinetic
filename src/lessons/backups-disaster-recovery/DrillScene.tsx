import { useMemo, useState, type ReactNode } from 'react';
import { CellGrid } from '../../components/CellGrid';
import { Box, SectionTitle } from '../../components/Panel';
import { SeedField } from '../../components/SeedField';
import { StageFrame } from '../../components/StageFrame';
import { Button, Hint, Legend, Provenance, ProvenanceRow, Segmented, Stat, Stats, Toggle } from '../../components/ui';
import { DRILL_PLAN, drillCaption, drillRows, drillSets } from './drillView';
import { FAULT_TEXT, backupSets, lowestUntestedFailure, restoreFrom, soundOutcome, type Plan } from './plan';
import { DRILL_OPEN, minutesText } from './view';
import { outcomeText } from './planView';

const METHODS = [{ value: 'snapshots' as const, label: 'Snapshots only' }, { value: 'snapshots-log' as const, label: 'Snapshots and log archive' }];
const ROW_CELL = { cell: 30 };

export function DrillScene({ picker }: { picker: ReactNode }) {
  const [seed, setSeed] = useState<number>(DRILL_OPEN.seed);
  const [method, setMethod] = useState<Plan['method']>(DRILL_PLAN.method);
  const [keyWith, setKeyWith] = useState<boolean>(DRILL_PLAN.keyWith);
  const [tested, setTested] = useState(false);
  const [fixed, setFixed] = useState(false);
  const [struck, setStruck] = useState(false);

  const plan: Plan = useMemo(() => ({ ...DRILL_PLAN, method, keyWith }), [method, keyWith]);
  const hidden = useMemo(() => backupSets(plan, seed), [plan, seed]);
  const sets = useMemo(() => drillSets(hidden, tested, fixed), [hidden, tested, fixed]);
  const rows = useMemo(() => drillRows(sets), [sets]);
  const outcome = useMemo(() => restoreFrom(plan, fixed ? hidden.map((s) => ({ ...s, fault: null, gapSegment: null })) : hidden, seed), [plan, hidden, fixed, seed]);
  const sound = useMemo(() => soundOutcome(plan, seed), [plan, seed]);
  const lowest = useMemo(() => lowestUntestedFailure(plan), [plan]);
  const found = hidden.filter((s) => s.fault !== null);
  const caption = drillCaption({ tested, fixed, struck, found: found.map((s) => s.fault!), outcome, sound });
  const reset = (patch: () => void) => {
    patch();
    setTested(false);
    setFixed(false);
    setStruck(false);
  };

  return (
    <StageFrame
      height={520}
      intro={caption}
      introKey={caption}
      stats={
        <Stats>
          <Stat label="Backup sets" value={sets.length} sub="a full, incrementals, and the log archive" />
          <Stat label="Faults found by a drill" value={tested ? found.length : '?'} color={tested && found.length > 0 ? 'var(--bad)' : undefined} sub={tested ? (found.length > 0 ? FAULT_TEXT[found[0].fault!] : 'every set restored') : 'not tested yet'} />
          <Stat label="At the disaster" value={struck ? (outcome.restored ? (outcome.reached < sound.reached ? 'restored, but short' : 'restored') : 'failed') : 'not struck'} color={struck ? (outcome.restored && outcome.reached >= sound.reached ? 'var(--ok)' : 'var(--bad)') : undefined} sub={struck ? outcomeText(outcome) : 'press Disaster now'} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--dim)', label: 'a backup set nobody has restored (unverified)', shape: 'square' },
            { color: 'var(--ok)', label: 'a set restored in a drill (verified, with a tick)', shape: 'square' },
            { color: 'var(--bad)', label: 'a set with a fault, or a log gap', shape: 'square' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <SeedField seed={seed} onSeed={(s) => reset(() => setSeed(s))} label="Seed (the hidden fault)" />
          <Button onClick={() => reset(() => setSeed(lowest ?? 0))}>Load seed {lowest}</Button>
        </>,
        <>
          <Segmented label="Protection" value={method} onChange={(m) => reset(() => setMethod(m))} options={METHODS} />
          <Toggle label="Encryption key" value={keyWith} onChange={(v) => reset(() => setKeyWith(v))} off="Kept separately" on="With the backup" />
        </>,
        <>
          <Button variant="primary" softDisabled={tested} onClick={() => setTested(true)}>Restore test</Button>
          <Button softDisabled={!tested || fixed || found.length === 0} onClick={() => setFixed(true)}>Fix what the test found</Button>
          <Button variant="danger" onClick={() => setStruck(true)}>Disaster now</Button>
          <Button onClick={() => reset(() => undefined)}>Reset</Button>
        </>,
      ]}
    >
      <div className="bdr-stage stage-pad">
        <Box>
          <SectionTitle hint="until a set is restored, nobody knows whether it works">Backup sets</SectionTitle>
          <CellGrid
            rows={rows.length}
            cols={1}
            size={ROW_CELL}
            rowLabels={rows.map((r) => r.label)}
            cell={(r) => rows[r].cell}
            rowDecor={(r) => rows[r].rail}
            ariaLabel="Backup sets and whether each has been restored"
          />
          {struck && <p className={`bdr-verdict ${outcome.restored && outcome.reached >= sound.reached ? 'is-ok' : 'is-bad'}`} role="status">{outcomeText(outcome)} A sound plan would have lost {minutesText(sound.lostMin)}.</p>}
          <Hint tone="muted" block>A restore test finds a fault in a drill, where it costs an afternoon. Never tested, the same fault is found at the disaster. The 3-2-1 rule is a rule of thumb, not a standard.</Hint>
        </Box>
        <ProvenanceRow>
          <Provenance kind="toy" seed={seed}>one hidden fault is placed by the seed on one set; the fault kinds are common ones, not a complete list</Provenance>
          <Provenance kind="simulated" seed={seed}>the restore is run on the toy week of writes, and the faults are not found until a drill restores the set</Provenance>
          <Provenance kind="illustrative">failure rates are made up: a fault turns up on about a third of seeds</Provenance>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}
