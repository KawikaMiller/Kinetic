import { useMemo, useState, type ReactNode } from 'react';
import { Box, SectionTitle } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { WideRegion } from '../../components/WideRegion';
import { Button, ChipButton, ClaimLabel, Hint, Legend, Provenance, ProvenanceRow, Slider, Stat, Stats } from '../../components/ui';
import { integer } from '../../core/format';
import { cycleCaption } from './captions';
import { exhaustiveText } from './checkText';
import { INPUT_VECTORS, PROCS, type Inputs } from './onePhase';
import {
  DELIVERIES_PER_ROUND, EXHAUSTIVE_ROUNDS, MAX_REPEATS, PROCESS_COUNT, START_INPUTS, choicesFromGrid, assistChoices, cyclingChoices, repeatRounds, sameConfiguration,
  searchFor, togglePick, type Configuration, type Picks, type Prop,
} from './rounds';

const EMPTY_GRID: Picks = [[], [], []];
const gridOf = (pairs: readonly (readonly number[])[]): Picks => pairs.map((p) => [...p]);
const EXHAUSTIVE_FACTS = [1, EXHAUSTIVE_ROUNDS];
/** Narrowest width, px, at which the exhaustive-facts table reads (its last header is the point of it). */
const FACTS_TABLE_MIN_WIDTH = 460;
const propText = (p: Prop) => (p === null ? '⊥' : String(p));

export function CycleScene({ picker }: { picker: ReactNode }) {
  const [inputs, setInputs] = useState<Inputs>(START_INPUTS);
  const [phase1, setPhase1] = useState<Picks>(EMPTY_GRID);
  const [phase2, setPhase2] = useState<Picks>(EMPTY_GRID);
  const [refusal, setRefusal] = useState<string | null>(null);
  const [repeats, setRepeats] = useState(1);
  const [played, setPlayed] = useState<number | null>(null);
  const [searched, setSearched] = useState(false);

  const start = useMemo<Configuration>(() => ({ est: [...inputs], decision: [null, null, null] }), [inputs]);
  const choices = useMemo(() => choicesFromGrid(phase1, phase2), [phase1, phase2]);
  const run = useMemo(() => (choices && played !== null ? repeatRounds(start, choices, played) : null), [choices, played, start]);
  const cycling = useMemo(() => cyclingChoices(inputs).length, [inputs]);
  const last = run && run.rounds.length > 0 ? run.rounds[run.rounds.length - 1] : null;
  const same = last ? sameConfiguration(last.after, start) : null;
  const facts = useMemo(() => (searched ? EXHAUSTIVE_FACTS.map((h) => ({ horizon: h, ...searchFor(START_INPUTS, h) })) : null), [searched]);
  const valencies = useMemo(() => (searched ? INPUT_VECTORS.map((v) => ({ inputs: v, result: searchFor(v, EXHAUSTIVE_ROUNDS) })) : null), [searched]);

  const pick = (phase: 1 | 2, i: number, source: number) => {
    const grid = phase === 1 ? phase1 : phase2;
    const t = togglePick(grid[i], i, source);
    if (!t.ok) {
      setRefusal(t.reason);
      return;
    }
    setRefusal(null);
    setPlayed(null);
    const next = grid.map((c, k) => (k === i ? t.picks : c));
    (phase === 1 ? setPhase1 : setPhase2)(next);
  };
  const assist = () => {
    const found = assistChoices(inputs);
    if (!found) return;
    setPhase1(gridOf(found.phase1));
    setPhase2(gridOf(found.phase2));
    setRefusal(null);
    setPlayed(null);
  };
  const reset = () => {
    setPhase1(EMPTY_GRID);
    setPhase2(EMPTY_GRID);
    setRefusal(null);
    setPlayed(null);
  };

  const caption = cycleCaption({ inputs, choices, run, same, repeats: played, cycling });
  return (
    <StageFrame
      height={460}
      intro={caption}
      introKey={`${inputs.join('')}|${phase1.join('/')}|${phase2.join('/')}|${played}|${refusal ?? ''}|${searched}`}
      stats={
        <Stats>
          <Stat label="Same configuration as the start" value={same === null ? '–' : same ? 'yes' : 'no'} color={same ? 'var(--orange)' : undefined} sub="estimates and decisions, compared by equality" />
          <Stat label="Deliveries" value={run ? run.rounds.length * DELIVERIES_PER_ROUND : 0} sub={run ? `${run.rounds.length} round${run.rounds.length === 1 ? '' : 's'} of ${DELIVERIES_PER_ROUND}` : 'press Play round'} />
          <Stat label="Decisions" value={last ? (last.after.decision.some((d) => d !== null) ? last.after.decision.map((d) => d ?? '–').join(' ') : 'none') : '–'} color={last?.after.decision.some((d) => d !== null) ? 'var(--ok)' : 'var(--dim)'} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--hi)', label: 'a message the scheduler lets this process take' },
            { color: 'var(--dim)', label: 'undecided' },
            { color: 'var(--orange)', label: 'the round that returns to where it started' },
            { color: 'var(--ok)', label: 'a decided value' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          {PROCS.map((p, i) => (
            <ChipButton key={p} tone="amber" on={inputs[i] === 1} onClick={() => { setInputs(inputs.map((b, k) => (k === i ? 1 - b : b)) as unknown as Inputs); setPlayed(null); }}>
              {p} input {inputs[i]}
            </ChipButton>
          ))}
        </>,
        <>
          <Button onClick={assist} softDisabled={cycling === 0}>Assist: load a round that cycles</Button>
          <Button onClick={() => setPlayed(1)} softDisabled={choices === null}>Play round</Button>
          <Slider label="Repeat the round" value={repeats} min={1} max={MAX_REPEATS} format={(v) => `${v} times`} onChange={(v) => { setRepeats(v); }} />
          <Button onClick={() => setPlayed(repeats)} softDisabled={choices === null}>Repeat</Button>
          <Button onClick={reset}>Clear choices</Button>
          <Button onClick={() => setSearched(true)}>Search every schedule (R = {EXHAUSTIVE_ROUNDS})</Button>
        </>,
      ]}
    >
      <div className="flp-stage stage-pad">
        <div className="flp-grids">
          {([1, 2] as const).map((phase) => (
            <Box key={phase}>
              <SectionTitle hint={phase === 1 ? 'which two estimates each process takes' : 'which two proposals each process takes'}>Phase {phase}</SectionTitle>
              {PROCS.map((p, i) => (
                <div key={p} className="flp-cell">
                  <span className="flp-who">{p} takes</span>
                  {PROCS.map((src, j) => (
                    <ChipButton key={src} tone="hi" on={(phase === 1 ? phase1 : phase2)[i].includes(j)} onClick={() => pick(phase, i, j)}>
                      {src}
                    </ChipButton>
                  ))}
                </div>
              ))}
            </Box>
          ))}
        </div>
        {refusal && <Hint tone="bad" block>{refusal}</Hint>}
        {last && (
          <Box>
            <SectionTitle hint="computed from the protocol rule, not typed">The round just played</SectionTitle>
            <div className="flp-line">proposals after phase 1: <b className="mono">{last.proposals.map(propText).join(' ')}</b> (⊥ means the two estimates taken differed)</div>
            <div className="flp-line">estimates after the round: <b className="mono">{last.after.est.join(' ')}</b>, started at <b className="mono">{start.est.join(' ')}</b></div>
            <div className="flp-verdict">
              {same ? <span className="chip tone-orange">same configuration as the start of round 1: yes</span> : <span className="chip tone-dim">same configuration as the start of round 1: no</span>}
              {run?.decidedIn !== null && run?.decidedIn !== undefined && <span className="chip tone-ok">a process decided in round {run.decidedIn}</span>}
            </div>
            {same && run?.decidedIn === null && (
              <Hint block>Repeat this round as long as you like: each repetition is a legal schedule and no process decides. That holds for this protocol under this schedule, and it is a cycle in the state space.</Hint>
            )}
          </Box>
        )}
        <Hint block>{cycling} of {integer(729)} round schedules cycle from inputs {inputs.join(' ')}: found by trying every pair choice for every process and phase.</Hint>
        {facts && valencies && (
          <Box>
            <SectionTitle hint={`every schedule of takes, ${PROCESS_COUNT} processes, inputs ${START_INPUTS.join(' ')}`}>Exhaustive facts (R rounds)</SectionTitle>
            <WideRegion minWidth={FACTS_TABLE_MIN_WIDTH} noun="table">
            <table className="data-table">
              <thead><tr><th>R</th><th>reachable configurations</th><th>two different decisions</th><th>undecided at the horizon</th></tr></thead>
              <tbody>
                {facts.map((f) => (
                  <tr key={f.horizon}>
                    <td>{f.horizon}</td>
                    <td>{integer(f.states)}{f.truncated ? ' (truncated)' : ''}</td>
                    <td>{f.disagreements}</td>
                    <td>{f.terminalUndecided} of {f.terminal} final configurations</td>
                  </tr>
                ))}
              </tbody>
            </table>
            </WideRegion>
            <Hint block>Agreement {facts[facts.length - 1].truncated ? 'was not found broken in the states explored' : exhaustiveText(facts[facts.length - 1].states, `3 processes, binary inputs, ${EXHAUSTIVE_ROUNDS} rounds, any two messages per phase`)}. Valency of each input vector within a horizon of {EXHAUSTIVE_ROUNDS} rounds:</Hint>
            <div className="flp-valencies">
              {valencies.map((v) => (
                <span key={v.inputs.join('')} className="chip tone-info">{v.inputs.join(' ')}: {v.result.valency}</span>
              ))}
            </div>
            <Hint block>None is bivalent. FLP&apos;s bivalent configuration belongs to a protocol that survives a crash and always decides; this protocol survives a crash by not deciding, so no such configuration shows up within R = {EXHAUSTIVE_ROUNDS} rounds here.</Hint>
          </Box>
        )}
        <Hint block>A finite search found one repeating schedule for this protocol. FLP is the claim that every deterministic consensus protocol that keeps agreement and survives one crash has such a schedule; the bivalence argument behind it is outlined in the lesson and not run.</Hint>
        <ProvenanceRow>
          <Provenance kind="toy">a Ben-Or-style round without its coin, n = 3, f = 1</Provenance>
          <Provenance kind="from-memory">Ben-Or 1983 is the coin-flipping original; check the paper before relying on its details</Provenance>
          <ClaimLabel kind="theorem">FLP: every deterministic consensus protocol that stays safe and survives one crash has such a schedule</ClaimLabel>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}
