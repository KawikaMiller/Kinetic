import { useMemo, useState, type ReactNode } from 'react';
import { Box, SectionTitle } from '../../components/Panel';
import { SeedField } from '../../components/SeedField';
import { StageFrame } from '../../components/StageFrame';
import { Button, ChipButton, ClaimLabel, Hint, Legend, Provenance, ProvenanceRow, Segmented, Slider, Stat, Stats, Toggle } from '../../components/ui';
import { MAX_LOG_MIN, MAX_SNAPSHOT_H, MIN_LOG_MIN, MIN_SNAPSHOT_H } from './backup';
import { planCaption, planRows } from './planView';
import { DEFAULT_PLAN, SCENARIOS, WEAK_PLAN, type Plan, type ScenarioId, type Tests, type Where } from './plan';
import { PLAN_OPEN, minutesText } from './view';

const METHODS = [{ value: 'replica' as const, label: 'A replica only' }, { value: 'snapshots' as const, label: 'Snapshots' }, { value: 'snapshots-log' as const, label: 'Snapshots and log archive' }];
const COPIES = [{ value: 1 as const, label: '1 copy' }, { value: 2 as const, label: '2 copies' }, { value: 3 as const, label: '3 copies' }];
const WHERE: { value: Where; label: string }[] = [{ value: 'disk', label: 'Same disk' }, { value: 'account', label: 'Same account' }, { value: 'region', label: 'Another region' }, { value: 'separate', label: 'Another account' }];
const TESTS: { value: Tests; label: string }[] = [{ value: 'never', label: 'Never' }, { value: 'quarterly', label: 'Quarterly' }, { value: 'weekly', label: 'Weekly' }];
const LOCK_MAX_DAYS = 30;
const WHERE_NAME: Record<Where, string> = { disk: 'same disk', account: 'same account', region: 'another region', separate: 'another account' };

export function PlanScene({ picker }: { picker: ReactNode }) {
  const [plan, setPlan] = useState<Plan>(DEFAULT_PLAN);
  const [seed, setSeed] = useState<number>(PLAN_OPEN.seed);
  const [scenario, setScenario] = useState<ScenarioId>(PLAN_OPEN.scenario);
  const set = (patch: Partial<Plan>) => setPlan({ ...plan, ...patch });

  const rows = useMemo(() => planRows(plan, seed), [plan, seed]);
  const chosen = rows.find((r) => r.id === scenario)!;
  const survived = rows.filter((r) => r.verdict.ok).length;
  const caption = planCaption(chosen, survived, rows.length);

  return (
    <StageFrame
      height={560}
      intro={caption}
      introKey={caption}
      stats={
        <Stats>
          <Stat label="Scenarios survived" value={`${survived} of ${rows.length}`} color={survived === rows.length ? 'var(--ok)' : 'var(--bad)'} sub="computed from the plan below" />
          <Stat label="Data lost" value={chosen.verdict.ok ? minutesText(chosen.verdict.lostMin!) : 'unrecoverable'} color="var(--bad)" sub={chosen.label} />
          <Stat label="Downtime" value={chosen.verdict.ok ? minutesText(chosen.verdict.downtimeMin!) : 'no restore'} color="var(--orange)" sub={chosen.verdict.ok ? 'time to restore, illustrative' : 'nothing to restore from'} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--ok)', label: 'a scenario the plan survives', shape: 'square' },
            { color: 'var(--bad)', label: 'a scenario it does not survive, and data lost', shape: 'square' },
            { color: 'var(--orange)', label: 'downtime', shape: 'square' },
            { color: 'var(--violet)', label: 'copies in other failure domains', shape: 'square' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          {SCENARIOS.map((s) => (
            <ChipButton key={s.id} tone="info" size="md" on={scenario === s.id} onClick={() => setScenario(s.id)}>{s.label}</ChipButton>
          ))}
        </>,
        <>
          <Segmented label="Protection" value={plan.method} onChange={(method) => set({ method })} options={METHODS} />
          <Slider label="Snapshot every" value={plan.snapshotH} min={MIN_SNAPSHOT_H} max={MAX_SNAPSHOT_H} step={6} onChange={(snapshotH) => set({ snapshotH })} format={(v) => `${v} h`} />
          {plan.method === 'snapshots-log' && <Slider label="Log segment every" value={plan.logMin} min={MIN_LOG_MIN} max={MAX_LOG_MIN} step={5} onChange={(logMin) => set({ logMin })} format={(v) => `${v} min`} />}
        </>,
        <>
          <Segmented label="Copies" value={plan.copies} onChange={(copies) => set({ copies })} options={COPIES} />
          <Segmented label="Where the extra copies are" value={plan.where} onChange={(where) => set({ where })} options={WHERE} />
        </>,
        <>
          <Toggle label="Immutability" value={plan.immutableDays > 0} onChange={(on) => set({ immutableDays: on ? 7 : 0 })} off="Off" on="Object lock" />
          {plan.immutableDays > 0 && <Slider label="Locked for" value={plan.immutableDays} min={1} max={LOCK_MAX_DAYS} onChange={(immutableDays) => set({ immutableDays })} format={(v) => `${v} days`} />}
          <Segmented label="Restore test" value={plan.tests} onChange={(tests) => set({ tests })} options={TESTS} />
          <Toggle label="Encryption key" value={plan.keyWith} onChange={(keyWith) => set({ keyWith })} off="Kept separately" on="With the backup" />
        </>,
        <>
          <SeedField seed={seed} onSeed={setSeed} label="Seed (the hidden fault)" />
          <Button onClick={() => setPlan(DEFAULT_PLAN)}>A sound plan</Button>
          <Button onClick={() => setPlan(WEAK_PLAN)}>A weak plan</Button>
        </>,
      ]}
    >
      <div className="bdr-stage stage-pad">
        <Box>
          <SectionTitle hint="every scenario strikes at Thursday 14:07 UTC">What the plan survives</SectionTitle>
          <div className="bdr-copies" role="img" aria-label={`${plan.copies} ${plan.copies === 1 ? 'copy' : 'copies'}`}>
            {Array.from({ length: plan.copies }, (_, i) => (
              <span key={i} className={`bdr-copy ${i === 0 ? 'is-local' : 'is-away'}`}>{i === 0 ? 'copy 1: on the database disk' : `copy ${i + 1}: ${WHERE_NAME[plan.where]}`}</span>
            ))}
          </div>
          <div className="bdr-scroll">
            <table className="bdr-table table-cards">
              <thead><tr><th scope="col">Scenario</th><th scope="col">Result</th><th scope="col">Data lost</th><th scope="col">Downtime</th><th scope="col">Why</th></tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className={r.id === scenario ? 'is-chosen' : undefined}>
                    <td data-label="Scenario">{r.label}</td>
                    <td data-label="Result" className={r.verdict.ok ? 'bdr-ok' : 'bdr-bad'}>{r.verdict.ok ? 'recoverable' : 'not recoverable'}</td>
                    <td data-label="Data lost" className={r.verdict.ok ? 'bdr-bad' : undefined}>{r.verdict.ok ? minutesText(r.verdict.lostMin!) : 'all of it since the last good copy'}</td>
                    <td data-label="Downtime" className={r.verdict.ok ? 'bdr-orange' : undefined}>{r.verdict.ok ? minutesText(r.verdict.downtimeMin!) : 'no restore'}</td>
                    <td data-label="Why">{r.verdict.why}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Hint tone="muted" block>{chosen.story}</Hint>
        </Box>
        <Box>
          <SectionTitle>Rules of thumb</SectionTitle>
          <p className="bdr-note"><ClaimLabel kind="practice">3-2-1: three copies, on two kinds of media, one of them offsite</ClaimLabel> is a common rule of thumb, not a standard. A replica is a copy that follows every change, a bad one included, so it is not a backup.</p>
        </Box>
        <ProvenanceRow>
          <Provenance kind="toy" seed={seed}>a plan scored by simple rules over a toy week; the hidden fault comes from the seed</Provenance>
          <Provenance kind="illustrative">restore times, a one-minute replica lag, a five-minute failover and the three days it takes to notice an attacker are made-up round numbers; no vendor limits are quoted</Provenance>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}
