import { useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { Box, SectionTitle } from '../../components/Panel';
import { SequenceDiagram } from '../../components/SequenceDiagram';
import { StageFrame } from '../../components/StageFrame';
import { Button, ChipButton, ClaimLabel, Hint, Legend, Provenance, ProvenanceRow, Segmented, Stat, Stats, Toggle } from '../../components/ui';
import { integer } from '../../core/format';
import { holdsText, traitorCaption } from './captions';
import { sampledText } from './checkText';
import { ATTACK, COMMANDER, RETREAT, generalName, judge, majorityRuleNumber, orderName, runOm, setupOfState, tryEveryBehaviour, tryEveryRule, behaviourOfState, chooseTraitor, DEFAULT_TRAITOR_STATE, type Bit, type TraitorState } from './om';
import { SEED_RANGE, SEEDS_TOTAL, sweepOm } from './omNodes';

const SIZES = [{ value: 3, label: '3 generals' }, { value: 4, label: '4 generals' }];

const lieutenantsOf = (n: number) => Array.from({ length: n - 1 }, (_, k) => k + 1);

export function TraitorScene({ picker }: { picker: ReactNode }) {
  const [state, setState] = useState<TraitorState>(DEFAULT_TRAITOR_STATE);
  const [ran, setRan] = useState(false);
  const [refusal, setRefusal] = useState<string | null>(null);
  const [panel, setPanel] = useState<'behaviours' | 'rules' | null>(null);

  const setup = useMemo(() => setupOfState(state), [state]);
  const run = useMemo(() => runOm(setup), [setup]);
  const verdict = useMemo(() => judge(setup, run), [setup, run]);
  const behaviour = useMemo(() => (state.traitor === null ? null : behaviourOfState({ ...state, traitor: state.traitor })), [state]);
  const behaviours = useMemo(() => (panel === 'behaviours' ? tryEveryBehaviour(state.n) : null), [panel, state.n]);
  const sampled = useMemo(() => (panel === 'behaviours' ? sweepOm(state.n, 1, 1) : null), [panel, state.n]);
  const rules = useMemo(() => (panel === 'rules' ? tryEveryRule(state.n) : null), [panel, state.n]);
  const ladder = useMemo(
    () => ({
      actors: Array.from({ length: state.n }, (_, i) => ({ id: `G${i}`, label: generalName(i), tone: i === COMMANDER ? ('amber' as const) : ('sky' as const) })),
      messages: run.messages.map((m, k) => ({
        id: `m${k}`, from: `G${m.from}`, to: `G${m.to}`, label: orderName(m.value as Bit), tone: m.traitor ? ('orange' as const) : undefined,
        note: m.path.length === 1 ? 'round 1' : 'round 2',
      })),
    }),
    [state.n, run],
  );

  const edit = (patch: Partial<TraitorState>) => {
    setState({ ...state, ...patch });
    setRan(false);
    setRefusal(null);
    setPanel(null);
  };
  const toggleTraitor = (i: number) => {
    const next = chooseTraitor(state, i);
    if (next.ok) edit(next.state);
    else setRefusal(next.reason);
  };
  const audience = state.traitor === null ? [] : lieutenantsOf(state.n).filter((l) => l !== state.traitor);

  const every = panel === 'behaviours' && behaviours ? { total: behaviours.total, breaking: behaviours.breaking.length } : null;
  const caption = traitorCaption({ setup, behaviour, ran, refusal, every });
  return (
    <StageFrame
      height={480}
      intro={caption}
      introKey={`${state.n}|${state.traitor}|${state.order}|${JSON.stringify(state.bits)}|${ran}|${refusal ?? ''}|${panel}`}
      stats={
        <Stats>
          <Stat label="IC1: loyal lieutenants agree" value={!ran ? '–' : verdict.ic1 ? 'holds' : 'broken'} color={!ran ? undefined : verdict.ic1 ? 'var(--ok)' : 'var(--bad)'} sub="independent check over the decisions" />
          <Stat label="IC2: obey a loyal commander" value={!ran ? '–' : state.traitor === COMMANDER ? 'not applicable' : verdict.ic2 ? 'holds' : 'broken'} color={!ran || state.traitor === COMMANDER ? undefined : verdict.ic2 ? 'var(--ok)' : 'var(--bad)'} sub={state.traitor === COMMANDER ? 'the commander is the traitor' : `the order was ${orderName(state.order)}`} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--amber)', label: 'the commander' },
            { color: 'var(--sky)', label: 'a lieutenant' },
            { color: 'var(--orange)', label: 'the traitor and its messages' },
            { color: 'var(--bad)', label: 'a conflicting pair of messages, a broken rule' },
            { color: 'var(--ok)', label: 'a rule that holds' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <Segmented label="Generals" options={SIZES} value={state.n} onChange={(n) => edit({ n, traitor: state.traitor !== null && state.traitor >= n ? null : state.traitor, bits: {} })} />
          <Toggle label="A loyal commander orders" off="retreat" on="attack" value={state.order === ATTACK} onChange={(v) => edit({ order: v ? ATTACK : RETREAT })} />
        </>,
        <>
          {Array.from({ length: state.n }, (_, i) => (
            <ChipButton key={i} tone="orange" on={state.traitor === i} onClick={() => toggleTraitor(i)}>
              {state.traitor === i ? `${generalName(i)} is the traitor` : `Make ${generalName(i)} the traitor`}
            </ChipButton>
          ))}
        </>,
        <>
          {audience.map((r) => (
            <Toggle key={r} label={`${generalName(state.traitor!)} tells ${generalName(r)}`} off="0" on="1" value={(state.bits[r] ?? RETREAT) === ATTACK} onChange={(v) => edit({ bits: { ...state.bits, [r]: v ? ATTACK : RETREAT } })} />
          ))}
          {state.traitor === null && <Hint>Everybody is loyal. Make one general the traitor to choose its lies.</Hint>}
        </>,
        <>
          <Button variant="primary" onClick={() => setRan(true)}>Run</Button>
          <Button onClick={() => { setRefusal(null); setPanel('behaviours'); }}>Try every traitor behaviour</Button>
          <Button onClick={() => { setRefusal(null); setPanel('rules'); }}>Try every decision rule</Button>
          <Button onClick={() => { setState(DEFAULT_TRAITOR_STATE); setRan(false); setRefusal(null); setPanel(null); }}>Reset</Button>
        </>,
      ]}
    >
      <div className="bz-stage stage-pad">
        {refusal && <Hint tone="bad" block>{refusal}</Hint>}
        <div className="bz-generals">
          {Array.from({ length: state.n }, (_, i) => {
            const traitor = state.traitor === i;
            const decision = run.decisions.get(i);
            return (
              <Box key={i} className="bz-general" style={{ '--c': traitor ? 'var(--orange)' : i === COMMANDER ? 'var(--amber)' : 'var(--sky)' } as CSSProperties}>
                <SectionTitle hint={traitor ? 'traitor' : 'loyal'}>{generalName(i)}</SectionTitle>
                {i === COMMANDER ? (
                  <div className="bz-line">{traitor ? 'sends what you set' : `orders ${orderName(state.order)}`}</div>
                ) : ran && !traitor ? (
                  <>
                    <div className="bz-line">holds {holdsText(setup, i)}</div>
                    <div className="bz-line"><span className="chip tone-info">decides {decision}</span></div>
                  </>
                ) : (
                  <div className="bz-line">{traitor ? 'relays what you set' : 'waiting for Run'}</div>
                )}
              </Box>
            );
          })}
        </div>
        {ran && (
          <Box>
            <SectionTitle hint="round 1: the commander sends; round 2: each lieutenant relays">Message ladder</SectionTitle>
            <SequenceDiagram actors={ladder.actors} messages={ladder.messages} ariaLabel="The two rounds of oral messages" />
            <Hint block>A tie in what a lieutenant holds goes to retreat: a toy default, not part of the problem.</Hint>
          </Box>
        )}
        {behaviours && sampled && (
          <Box>
            <SectionTitle hint="exhaustive: one traitor, binary values, OM(1)">Every traitor behaviour</SectionTitle>
            <div className="bz-line"><b className="mono">n = {behaviours.n}: {behaviours.total} behaviours, {behaviours.breaking.length} break a rule</b></div>
            <div className="bz-line">
              {behaviours.breaking.length === 0 ? 'None breaks IC1 or IC2: every behaviour of one traitor with binary values is covered at this size (OM(1)).' : `The breaking ones: ${behaviours.breaking.map((b) => `${generalName(b.traitor)} says ${b.bits.join(' ')} with order ${orderName(b.order)}`).join('; ')}.`}
            </div>
            <div className="bz-line">Sampled, on distSim with random lies: {sampled.failing.length === 0 ? sampledText(SEEDS_TOTAL, SEEDS_TOTAL, SEED_RANGE.from, SEED_RANGE.to - 1) : `IC1 or IC2 failed on ${sampled.failing.length} of ${SEEDS_TOTAL} seeds (lowest ${sampled.lowestFailing}); sampled, not exhaustive`}.</div>
          </Box>
        )}
        {rules && (
          <Box>
            <SectionTitle hint="exhaustive: every rule a lieutenant could use on its own receipt and the relays">Every decision rule</SectionTitle>
            <div className="bz-line">
              <b className="mono">{rules.survivors.length} of {integer(rules.rules)}</b> rules satisfy IC1 and IC2 on all {rules.behaviours} behaviours
              {rules.survivors.length === 1 && rules.survivors[0] === majorityRuleNumber(state.n - 1) ? ': the majority rule.' : '.'}
            </div>
            <Hint block>{state.n === 3 ? 'This is a bounded instance of the impossibility, for one relay round at this size. It is not the theorem.' : 'This is a bounded search for one relay round at this size: one rule survives, so it is not an impossibility, and it is not the theorem either.'}</Hint>
          </Box>
        )}
        <ProvenanceRow>
          <Provenance kind="toy">a tie goes to retreat: a toy default</Provenance>
          <Provenance kind="simulated" seed={`${SEED_RANGE.from} to ${SEED_RANGE.to - 1}`}>sampled runs use seeded lies on distSim</Provenance>
          <ClaimLabel kind="theorem">3f + 1 generals are needed: argued, not run here (this scene shows the bounded instance)</ClaimLabel>
          <Provenance kind="from-memory">the problem and the result are from Lamport, Shostak and Pease (1982); check authors and year</Provenance>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}
