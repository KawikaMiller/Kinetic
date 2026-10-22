import { useMemo, useState, type ReactNode } from 'react';
import { Box, SectionTitle } from '../../components/Panel';
import { SeedField } from '../../components/SeedField';
import { StageFrame } from '../../components/StageFrame';
import { TracePlayer } from '../../components/TracePlayer';
import { ClaimLabel, Hint, Legend, Provenance, ProvenanceRow, Stat, Stats, Toggle } from '../../components/ui';
import { explorePathSteps } from '../../core/traceFrames';
import { decimal, integer } from '../../core/format';
import { escapeCaption, escapeStartText } from './captions';
import { livenessText, sampledText } from './checkText';
import {
  AND_TABLE, BROKEN_SEED, PROCS, SEED_RANGE, SEEDS_TOTAL, deliveriesIn, oneExplorer, runSeed, runSeeds, shortestDisagreement, symmetric, type Inputs, type OneState,
} from './onePhase';
import { COIN_ROUNDS, COIN_SEEDS, CYCLE_WITNESS, DELIVERIES_PER_ROUND, START_INPUTS, repeatRounds, undecidedCounts, undecidedProbabilities } from './rounds';

const TIMEOUT_INPUTS: Inputs = [1, 1, 0];
const RULES = symmetric(AND_TABLE);
const FIRST_COIN_ROUND = 2;

/** The one-line state of a process in a trace. */
const processText = (s: OneState, i: number): string => `${PROCS[i]}: input ${s.input}, ${s.decision === null ? 'undecided' : `decided ${s.decision}`}`;

export function EscapeScene({ picker }: { picker: ReactNode }) {
  const [seed, setSeed] = useState(BROKEN_SEED);
  const [coin, setCoin] = useState(false);
  const sweep = useMemo(() => runSeeds('one', RULES), []);
  const run = useMemo(() => runSeed('one', RULES, seed), [seed]);
  const shortest = useMemo(() => shortestDisagreement({ inputs: TIMEOUT_INPUTS, mode: 'one', rules: RULES }), []);
  const steps = useMemo(() => explorePathSteps(shortest.violation?.path ?? []), [shortest]);
  const start = useMemo(() => oneExplorer({ inputs: TIMEOUT_INPUTS, mode: 'one', rules: RULES }).init, []);
  const exact = useMemo(() => undecidedProbabilities(START_INPUTS, CYCLE_WITNESS, COIN_ROUNDS), []);
  const measured = useMemo(() => undecidedCounts(START_INPUTS, CYCLE_WITNESS, COIN_ROUNDS, COIN_SEEDS), []);
  const plain = useMemo(() => repeatRounds({ est: [...START_INPUTS], decision: [null, null, null] }, CYCLE_WITNESS, COIN_ROUNDS), []);
  const lowest = sweep.failing[0];

  const caption = escapeCaption({ seed, run, failing: sweep.failing.length, lowest, deliveries: deliveriesIn(shortest.violation?.path ?? []), coin, exact, plainDecided: plain.decidedIn });
  return (
    <StageFrame
      height={460}
      intro={caption}
      introKey={`${seed}|${coin}|${run.broken ?? ''}`}
      stats={
        <Stats>
          <Stat label="Timeout protocol breaks agreement" value={`${sweep.failing.length} of ${SEEDS_TOTAL}`} color="var(--bad)" sub={`seeds ${SEED_RANGE.from} to ${SEED_RANGE.to - 1}; lowest failing seed ${lowest}`} />
          <Stat label="Shortest disagreement" value={`${deliveriesIn(shortest.violation?.path ?? [])} deliveries`} sub={`found by search over ${shortest.states} states`} />
          <Stat label={`Undecided after round ${COIN_ROUNDS}`} value={coin ? decimal(exact[COIN_ROUNDS - 1], 4) : 'yes, with probability 1'} color={coin ? 'var(--info)' : 'var(--dim)'} sub={coin ? 'fair coins, same schedule' : 'no coin, same schedule'} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--bad)', label: 'disagreement' },
            { color: 'var(--ok)', label: 'a decided value' },
            { color: 'var(--dim)', label: 'undecided' },
            { color: 'var(--hi)', label: 'the step of the trace' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <SeedField seed={seed} onSeed={setSeed} />
          <Toggle label="Fair coin instead of keeping the estimate" value={coin} onChange={setCoin} />
        </>,
      ]}
    >
      <div className="flp-stage stage-pad">
        <Box>
          <SectionTitle hint="(a) a timeout: it decides on every seed here, and that costs agreement">Decide on the first message heard</SectionTitle>
          <div className="flp-line">
            seed {seed} drew inputs <b className="mono">{run.inputs.join(' ')}</b> and the network latencies chose who hears whom first:{' '}
            <b className="mono">{run.decisions.map((d, i) => `${PROCS[i]} ${d ?? 'undecided'}`).join(', ')}</b>.
          </div>
          <div className="flp-verdict">
            {run.broken ? <span className="chip tone-bad">{run.broken}</span> : <span className="chip tone-ok">this seed kept agreement and validity</span>}
          </div>
          <Hint block>
            Agreement and validity {sampledText(SEEDS_TOTAL - sweep.failing.length, SEEDS_TOTAL, SEED_RANGE.from, SEED_RANGE.to - 1)}; the timeout protocol fails on {sweep.failing.length} of {SEEDS_TOTAL} seeds.
          </Hint>
          <SectionTitle hint="the shortest schedule, from a breadth-first search; inputs 1 1 0, AND rule">Shortest disagreement</SectionTitle>
          <TracePlayer
            initial={start}
            steps={steps}
            startText={escapeStartText({ inputs: TIMEOUT_INPUTS, failing: sweep.failing.length, seeds: SEEDS_TOTAL, deliveries: deliveriesIn(shortest.violation?.path ?? []) })}
            label="Steps of the shortest schedule that breaks agreement"
            renderState={(state) => (
              <ul className="flp-trace">
                {state.nodes.map((s, i) => <li key={PROCS[i]}>{processText(s, i)}</li>)}
              </ul>
            )}
          />
        </Box>
        <Box>
          <SectionTitle hint="(b) a coin: the same fixed schedule, now with fair coins">Round by round, nobody has decided</SectionTitle>
          <table className="data-table">
            <thead><tr><th>after round</th><th>{coin ? 'exact probability undecided' : 'undecided?'}</th><th>{coin ? `measured over ${integer(COIN_SEEDS)} seeds` : 'rounds replayed'}</th></tr></thead>
            <tbody>
              {exact.map((p, r) => (
                <tr key={r}>
                  <td>{r + 1}</td>
                  <td>{coin ? `${decimal(p, 7).replace(/0+$/, '').replace(/\.$/, '')} (1/${2 ** r})` : plain.decidedIn === null ? 'yes' : 'no'}</td>
                  <td>{coin ? `${measured[r]} of ${integer(COIN_SEEDS)}` : `${r + 1} of ${COIN_ROUNDS}`}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <Hint block>
            {coin
              ? `Round 1 uses the same all-bottom schedule, so nobody decides in it. From round ${FIRST_COIN_ROUND} a decision needs the coins of P0 and P2 to match, which is a one-half chance each round. A schedule fixed in advance cannot adapt to coins; an adversary that sees the coins before it schedules is a different, stronger model.`
              : `With no coin the same schedule returns to the start every round: ${COIN_ROUNDS} rounds replayed, no process decided in ${COIN_ROUNDS * DELIVERIES_PER_ROUND} deliveries. That is bounded evidence for this protocol, not a proof about every protocol.`}
          </Hint>
        </Box>
        <Box>
          <SectionTitle hint="(c) add a timing assumption">Failure detectors and partial synchrony</SectionTitle>
          <div className="flp-line">Add a timing assumption and a leader can be elected: that is what Raft and Paxos lean on for progress, while their safety does not wait for any clock. Failure detectors (Chandra and Toueg) are the standard way to write such an assumption down.</div>
          <ProvenanceRow>
            <ClaimLabel kind="standard">Raft and Paxos stay safe under asynchrony and rely on timing for liveness</ClaimLabel>
          </ProvenanceRow>
        </Box>
        <ProvenanceRow>
          <Provenance kind="simulated" seed={seed}>seeded runs on distSim; the shortest schedule is an exhaustive search</Provenance>
          <Provenance kind="simulated" seed={`1 to ${COIN_SEEDS}`}>the coin table counts seeds 1 to {integer(COIN_SEEDS)}, whatever seed the field holds</Provenance>
          <Provenance kind="toy">three processes, binary inputs</Provenance>
          <Provenance kind="from-memory">Chandra and Toueg, 1996, for failure detectors; check the paper</Provenance>
        </ProvenanceRow>
        <Hint block>Liveness, separately: {livenessText(sweep.undecided, SEEDS_TOTAL, 'the end of the run')}. The timeout protocol decides on every seed, which is exactly why it can disagree.</Hint>
      </div>
    </StageFrame>
  );
}
