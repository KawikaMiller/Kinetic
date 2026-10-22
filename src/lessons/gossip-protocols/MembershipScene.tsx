import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { CellGrid } from '../../components/CellGrid';
import { Box, SectionTitle } from '../../components/Panel';
import { Curve, Plot2D, VLine } from '../../components/Plot2D';
import { SeedField } from '../../components/SeedField';
import { StageFrame } from '../../components/StageFrame';
import { Button, ChipButton, Hint, Legend, Provenance, ProvenanceRow, Slider, Stat, Stats, Toggle } from '../../components/ui';
import { MATRIX_MAX_NODES, falsePairsSub, initialMember, matrixCapText, memberSafetyText, membershipCaption, undrawnSuspicions, type MemberState } from './init';
import {
  ACCURACY_ROUNDS, BROKEN_MEMBER, BROKEN_MEMBER_SEED, CRASH_ROUND, CUT_FROM_ROUND, MEMBER, MEMBER_ROUNDS, SWEEP_SEEDS, accuracyFailures, readMembership, runMembership,
  suspicionCounts, type MemberSetup,
} from './model';

const MAX_SWEEP_N = 32;
const CHUNK_SEEDS = 10;

const legend = (
  <Legend
    items={[
      { color: 'var(--bad)', label: 'an observer suspects a node that is up' },
      { color: 'var(--orange)', label: 'an observer suspects the crashed node 0' },
      { color: 'var(--dim)', label: 'no suspicion' },
    ]}
  />
);

interface Checked {
  key: string;
  failures: number[];
  /** Seeds checked so far: the check runs in chunks so the page stays usable. */
  done: number;
}

const rounds = (v: number | null) => (v === null ? 'not by the end' : `${v} rounds`);

export function MembershipScene({ picker }: { picker: ReactNode }) {
  const [s, setS] = useState<MemberState>(initialMember);
  const [checked, setChecked] = useState<Checked | null>(null);
  const { setup, round } = s;
  const patch = (p: Partial<MemberSetup>) => setS((x) => ({ ...x, setup: { ...x.setup, ...p } }));
  const run = useMemo(() => runMembership(setup), [setup]);
  const read = useMemo(() => readMembership(run), [run]);
  const counts = useMemo(() => suspicionCounts(run), [run]);
  const falseLine = useMemo(() => counts.falseCount.map((c, r) => [r, c] as [number, number]), [counts]);
  const trueLine = useMemo(() => counts.trueCount.map((c, r) => [r, c] as [number, number]), [counts]);
  const maxCount = Math.max(1, ...counts.falseCount, ...counts.trueCount);
  const key = `${setup.n}|${setup.f}|${setup.tFail}`;
  const runId = useRef(0);
  useEffect(() => () => { runId.current = -1; }, []);
  const check = async () => {
    const mine = ++runId.current;
    const base = { n: setup.n, f: setup.f, tFail: setup.tFail };
    setChecked({ key, failures: [], done: 0 });
    let failures: number[] = [];
    for (let from = 1; from <= SWEEP_SEEDS; from += CHUNK_SEEDS) {
      await new Promise<void>((resume) => { setTimeout(resume, 0); });
      if (runId.current !== mine) return;
      failures = [...failures, ...accuracyFailures(base, from, Math.min(from + CHUNK_SEEDS, SWEEP_SEEDS + 1))];
      setChecked({ key, failures, done: Math.min(from + CHUNK_SEEDS - 1, SWEEP_SEEDS) });
    }
  };
  const shown = Math.min(setup.n, MATRIX_MAX_NODES);
  const hidden = undrawnSuspicions(run, round);
  const crashed = (r: number, c: number) => setup.crash && c === 0 && r >= CRASH_ROUND;
  const caption = membershipCaption(setup, read);
  const cutEnd = CUT_FROM_ROUND + setup.cutRounds;

  return (
    <StageFrame
      height={720}
      intro={caption}
      introKey={`${setup.n}|${setup.f}|${setup.tFail}|${setup.seed}|${setup.crash}|${setup.cut}|${setup.cutRounds}`}
      legend={legend}
      stats={
        <Stats>
          <Stat label="First suspicion of node 0" value={setup.crash ? (read.firstSuspicion === null ? 'none' : `${read.firstSuspicion} rounds`) : 'no crash'} sub="counted from the crash at round 40" />
          <Stat label="Detection time" value={setup.crash ? rounds(read.detection) : 'no crash'} color={read.detection === null ? undefined : 'var(--ok)'} sub="until every up node suspects it" />
          <Stat label="Live nodes suspected" value={read.falsePairs} color={read.falsePairs > 0 ? 'var(--bad)' : undefined} sub={falsePairsSub(setup, read.falsePairs)} />
          <Stat label="Convergence after the heal" value={setup.cut ? rounds(read.convergence) : 'no cut'} sub="until no up node suspects an up node" />
        </Stats>
      }
      controls={[
        <>
          {picker}
          <Slider label="Nodes n" value={setup.n} min={MEMBER.n.min} max={MEMBER.n.max} step={8} onChange={(n) => patch({ n })} />
          <Slider label="Fanout f" value={setup.f} min={MEMBER.f.min} max={MEMBER.f.max} onChange={(f) => patch({ f })} />
          <Slider label="Suspect after T_fail rounds" value={setup.tFail} min={MEMBER.tFail.min} max={MEMBER.tFail.max} onChange={(tFail) => patch({ tFail })} />
        </>,
        <>
          <Toggle label="Node 0" value={setup.crash} onChange={(crash) => patch({ crash })} off="Stays up" on="Crashes at round 40" />
          <Toggle label="Cluster" value={setup.cut} onChange={(cut) => patch({ cut })} off="Connected" on="Cut in two from round 40" />
          {setup.cut && <Slider label="Cut lasts" value={setup.cutRounds} min={MEMBER.cutRounds.min} max={MEMBER.cutRounds.max} format={(v) => `${v} rounds`} onChange={(cutRounds) => patch({ cutRounds })} />}
          <Slider label="Show round" value={round} min={0} max={MEMBER_ROUNDS} onChange={(r) => setS((x) => ({ ...x, round: r }))} />
        </>,
        <>
          <SeedField seed={setup.seed} onSeed={(seed) => patch({ seed })} />
          <ChipButton tone="bad" onClick={() => setS({ setup: { ...initialMember().setup, ...BROKEN_MEMBER, seed: BROKEN_MEMBER_SEED }, round: ACCURACY_ROUNDS })}>Load the lowest failing seed ({BROKEN_MEMBER_SEED})</ChipButton>
          {setup.n <= MAX_SWEEP_N && <Button onClick={check} softDisabled={checked !== null && checked.key === key && checked.done < SWEEP_SEEDS}>Check {SWEEP_SEEDS} seeds, no faults (runs in the background, up to about 8 s)</Button>}
          <Button onClick={() => { runId.current += 1; setS(initialMember()); setChecked(null); }}>Reset</Button>
        </>,
      ]}
    >
      <div className="gp-stage stage-pad">
        <Box>
          <SectionTitle hint={`round ${round}: row = the observer, column = the node it suspects`}>Who suspects whom</SectionTitle>
          <CellGrid
            rows={shown}
            cols={shown}
            size="xs"
            ariaLabel={`Suspicion matrix at round ${round}: each row is an observer and each column a node it may suspect`}
            cell={(r, c) => {
              if (r === c) return { text: '', tone: 'muted', fill: 'none' };
              if (setup.crash && r === 0 && round >= CRASH_ROUND) return { text: '', tone: 'dim', fill: 'none' };
              const suspects = run.suspectsByRound[round][r].includes(c);
              if (!suspects) return { text: '', tone: 'dim', fill: 'tint', intensity: 0.12 };
              return { text: '', tone: crashed(round, c) ? 'orange' : 'bad', fill: 'solid' };
            }}
          />
          {setup.n > shown && <Hint tone="muted" block>{matrixCapText(setup.n, hidden)}</Hint>}
          {setup.crash && round >= CRASH_ROUND && <Hint tone="muted" block>Node 0 is down from round {CRASH_ROUND}: its row stays empty and its column fills as the others notice.</Hint>}
        </Box>
        <Box>
          <SectionTitle hint="suspicions among the up nodes, per round">Suspicions over time</SectionTitle>
          <Plot2D x={{ domain: [0, MEMBER_ROUNDS], label: 'round' }} y={{ domain: [0, maxCount], label: 'suspicions' }} ariaLabel="Suspicions of live nodes and of the crashed node over the rounds">
            <Curve points={falseLine} tone="bad" />
            <Curve points={trueLine} tone="orange" />
            <VLine at={CRASH_ROUND} label="faults" tone="dim" />
            {setup.cut && <VLine at={cutEnd} label="heal" tone="violet" />}
            <VLine at={round} label="shown" tone="hi" />
          </Plot2D>
        </Box>
        {checked !== null && (
          <Hint tone={checked.key === key ? 'muted' : 'faint'} block>
            {checked.key === key && checked.done < SWEEP_SEEDS
              ? `Checking: ${checked.done} of ${SWEEP_SEEDS} seeds done, ${checked.failures.length} failing so far.`
              : checked.key === key
              ? `Accuracy (no up node suspects an up node), fault-free, ${ACCURACY_ROUNDS} rounds: fails on ${checked.failures.length} of ${SWEEP_SEEDS} seeds${checked.failures.length ? `, lowest failing seed ${checked.failures[0]}` : ''}. Sampled, not exhaustive.`
              : 'That check was for different settings. Press Check again.'}
          </Hint>
        )}
        <Hint tone="muted" block>
          Rule of thumb in numbers, from the sweep: T_fail has to outlast the time a heartbeat counter takes to reach everyone. At n = 16 and fanout 1, T_fail 12 fails on part of the seeds and 20 on none; at fanout 2, 12 is already safe.
        </Hint>
        <Hint tone="muted" block>{memberSafetyText()}</Hint>
        <ProvenanceRow>
          <Provenance kind="simulated" seed={setup.seed}>nodes gossiping heartbeat tables on the distSim harness, one round every 100 ms; the cut and the crash are produced by the harness</Provenance>
          <Provenance kind="from-memory">heartbeat-counter membership gossip is from a 1998 paper by van Renesse, Minsky and Hayden; verify the attribution</Provenance>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}
