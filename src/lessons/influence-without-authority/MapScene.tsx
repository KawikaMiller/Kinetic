import { Fragment, useMemo, useState } from 'react';
import { GraphView } from '../../components/GraphView';
import { StageFrame } from '../../components/StageFrame';
import { WideRegion } from '../../components/WideRegion';
import { Button, ChipButton, ClaimLabel, Hint, Legend, Provenance, ProvenanceRow, Segmented, Stat, Stats } from '../../components/ui';
import { ledgerLine, mapCaption, outcomeText, signed } from './captions';
import {
  ANGLES, EMPTY_PLAN, FOURTH_REFUSED, MAX_CONVERSATIONS, NATURAL_PLANS, POSITION_MAX, SIX_SLOT_PLAN, STAKEHOLDERS, SUPPORT_TO_PASS, VETO_INFLUENCE, VETO_POSITION,
  isUsed, planText, runPlan, searchPlans, stakeholderOf, startPositions,
  type Angle, type Outcome, type Slot, type StakeholderId,
} from './model';
import type { PlanState, SceneProps } from './opening';

const GRAPH = { width: 440, height: 270 } as const;
const BOX = { w: 100, h: 52 } as const;
const AT: Record<StakeholderId, { x: number; y: number }> = {
  gus: { x: 64, y: 90 }, dana: { x: 200, y: 42 }, eli: { x: 200, y: 140 }, hana: { x: 360, y: 42 }, fay: { x: 360, y: 140 }, ivo: { x: 64, y: 226 },
};
const NODES = STAKEHOLDERS.map((s) => ({ id: s.id, label: '', at: AT[s.id], shape: 'box' as const }));
/** "Listens to" arrows run from the person listened to. */
const EDGES = STAKEHOLDERS.flatMap((s) => (s.listensTo ? [{ from: s.listensTo, to: s.id }] : []));
const TABLE_MIN_WIDTH = 540;
const NONE = 'none';
const PERSON_OPTIONS = [{ value: NONE, label: 'Nobody' }, ...STAKEHOLDERS.map((s) => ({ value: s.id as string, label: s.name }))];
const ANGLE_OPTIONS = [{ value: NONE, label: 'No angle' }, ...ANGLES.map((a) => ({ value: a.id as string, label: a.label }))];
const START = startPositions();

const toneOf = (position: number) => (position >= 1 ? 'ok' : position <= VETO_POSITION ? 'bad' : 'dim');
const resultText = (out: Outcome): string => (out.pass ? 'passes' : 'fails');

/** Scene 1: three conversations before the meeting, then the room reacts by printed rules. */
export function MapScene({ picker, state, onState }: SceneProps & { state: PlanState; onState: (next: PlanState) => void }) {
  const [refusal, setRefusal] = useState('');
  const search = useMemo(() => searchPlans(), []);
  const out = runPlan(state.slots);
  const positions = state.ran ? out.final : START;
  const set = (slots: readonly Slot[], ran = false) => { setRefusal(''); onState({ slots, ran }); };
  const change = (i: number, patch: Partial<Slot>) => set(state.slots.map((s, j) => (j === i ? { ...s, ...patch } : s)));
  const rows = [
    { id: 'none', label: 'No conversations', plan: EMPTY_PLAN, note: '' },
    ...NATURAL_PLANS.map((p) => ({ id: p.id, label: p.label, plan: p.plan, note: '' })),
    { id: 'best', label: `The best of all ${search.total.toLocaleString('en-US')} three-slot plans`, plan: search.bestPlans[0], note: `${search.bestPlans.length} plans reach it; ${search.passing} of ${search.total.toLocaleString('en-US')} plans pass` },
    { id: 'six', label: 'Extension: all six people, each on their own concern', plan: SIX_SLOT_PLAN, note: `${SIX_SLOT_PLAN.length} conversations, more than the ${MAX_CONVERSATIONS} you have` },
  ];

  return (
    <StageFrame
      height={640}
      intro={mapCaption(state.slots, state.ran)}
      introKey={`${planText(state.slots)}|${state.ran}`}
      stats={
        <Stats>
          <Stat label="Weighted support" value={state.ran ? out.score : '–'} color={state.ran ? (out.score >= SUPPORT_TO_PASS ? 'var(--ok)' : 'var(--bad)') : undefined} sub={`needs ${SUPPORT_TO_PASS}: the sum of influence x position`} />
          <Stat label="Against" value={state.ran ? (out.vetoes.length ? out.vetoes.map((id) => stakeholderOf(id).name).join(', ') : 'nobody') : '–'} sub={`influence ${VETO_INFLUENCE} or more at −1 or below`} />
          <Stat label="The meeting" value={state.ran ? resultText(out) : 'not run'} color={state.ran ? (out.pass ? 'var(--ok)' : 'var(--bad)') : undefined} sub={state.ran ? 'by the rules below' : 'press Run the meeting'} />
        </Stats>
      }
      legend={<Legend items={[
        { color: 'var(--ok)', label: 'position +1 or +2', shape: 'square' },
        { color: 'var(--dim)', label: 'position 0', shape: 'square' },
        { color: 'var(--bad)', label: 'position −1 or −2', shape: 'square' },
        { color: 'var(--violet)', label: 'listens to (arrow from the one listened to)', shape: 'line' },
      ]} />}
      controls={[
        <>{picker}</>,
        ...state.slots.map((slot, i) => (
          <Fragment key={i}>
            <Segmented ariaLabel={`Conversation ${i + 1}: person`} label={`Conversation ${i + 1}`} value={slot.who ?? NONE} options={PERSON_OPTIONS} onChange={(v: string) => change(i, { who: v === NONE ? null : (v as StakeholderId) })} />
            <Segmented ariaLabel={`Conversation ${i + 1}: angle`} value={slot.angle ?? NONE} options={ANGLE_OPTIONS} onChange={(v: string) => change(i, { angle: v === NONE ? null : (v as Angle) })} />
          </Fragment>
        )),
        <>
          <Button variant="primary" onClick={() => onState({ ...state, ran: true })}>Run the meeting</Button>
          <Button onClick={() => set(EMPTY_PLAN)}>Clear the plan</Button>
          <Button onClick={() => setRefusal(FOURTH_REFUSED)}>Add a fourth conversation</Button>
        </>,
      ]}
    >
      <div className="iw-stage stage-pad">
        <Hint tone="muted" block>You propose retiring the legacy deploy tool next quarter. Positions run from −2 (strongly against) to +2 (strongly for). An influence number and a position sit in each box; an arrow runs from a person to those who listen to them.</Hint>
        <WideRegion minWidth={GRAPH.width} noun="map">
          <GraphView
            nodes={NODES}
            edges={EDGES}
            directed
            width={GRAPH.width}
            height={GRAPH.height}
            box={BOX}
            nodeMark={(id) => {
              const pos = positions[id];
              const against = state.ran && out.vetoes.includes(id);
              return { tone: toneOf(pos), fill: against ? 'solid' : 'tint' };
            }}
            edgeMark={() => ({ tone: 'violet', width: 2.5 })}
            renderNode={(n, at, base) => (
              <>
                {base}
                <text className="graph-node-label" x={at.x} y={at.y - 6} textAnchor="middle">{stakeholderOf(n.id).name}</text>
                <text className="iw-node-sub" x={at.x} y={at.y + 13} textAnchor="middle">{`inf ${stakeholderOf(n.id).influence}, ${signed(positions[n.id])}`}</text>
              </>
            )}
            ariaLabel="Stakeholder map: six people, their influence and position, and who listens to whom"
          />
        </WideRegion>
        {refusal && <Hint tone="bad" block>{refusal}</Hint>}
        <WideRegion minWidth={TABLE_MIN_WIDTH} noun="table">
          <table className="data-table iw-table">
            <caption>The six people (invented){state.ran ? ', with their positions after the meeting' : ''}</caption>
            <thead><tr><th>Person</th><th>Role</th><th>Influence</th><th>Starts at</th><th>Cares about</th><th>Listens to</th><th>{state.ran ? 'After the meeting' : 'Now'}</th></tr></thead>
            <tbody>
              {STAKEHOLDERS.map((s) => (
                <tr key={s.id}>
                  <td>{s.name}</td><td>{s.role}</td><td>{s.influence}</td><td>{signed(s.start)}</td><td>{s.concern}</td><td>{s.listensTo ? stakeholderOf(s.listensTo).name : 'nobody'}</td><td>{signed(positions[s.id])}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </WideRegion>
        <div className="iw-rules">
          <b>The rules, in order (all invented)</b>
          <ol>
            <li><b>R1 match.</b> An angle equal to the person&apos;s concern moves them +1 (up to +{POSITION_MAX}); any other angle moves them 0.</li>
            <li><b>R2 spillover.</b> After a conversation, each person who listens to the one you spoke with and stands lower moves +1 if that person is now +1 or more.</li>
            <li><b>R3 surprise.</b> In the meeting, anyone you never spoke with who stands at 0 or below drops 1 (down to −{POSITION_MAX}).</li>
            <li><b>R4 outcome.</b> The meeting passes if the weighted support is at least {SUPPORT_TO_PASS} and nobody of influence {VETO_INFLUENCE} or more stands at −1 or below.</li>
          </ol>
        </div>
        {state.ran && (
          <div className="iw-ledger">
            <b>Ledger</b>
            <ol>{out.ledger.map((e) => <li key={e.slot}>{ledgerLine(e)}</li>)}</ol>
            <span>{outcomeText(out)}</span>
          </div>
        )}
        <WideRegion minWidth={TABLE_MIN_WIDTH} noun="table">
          <table className="data-table iw-table">
            <caption>The same case under other plans (all under the same invented rules)</caption>
            <thead><tr><th>Plan</th><th>Conversations</th><th>Support</th><th>Result</th><th /></tr></thead>
            <tbody>
              {rows.map((r) => {
                const o = runPlan(r.plan);
                const used = r.plan.filter(isUsed).length;
                return (
                  <tr key={r.id}>
                    <td>{r.label}{r.note ? `: ${r.note}` : ''}</td>
                    <td>{planText(r.plan)}</td>
                    <td>{o.score}</td>
                    <td style={{ color: o.pass ? 'var(--ok)' : 'var(--bad)' }}>{resultText(o)}</td>
                    <td>{used <= MAX_CONVERSATIONS && <ChipButton onClick={() => set(r.plan)}>Load</ChipButton>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </WideRegion>
        <ProvenanceRow>
          <Provenance kind="invented">the people, their positions and influence, and the four rules are made up; nothing here is evidence about real people</Provenance>
          <ClaimLabel kind="practice">talking to people who will be affected before a meeting is a common way to avoid surprise</ClaimLabel>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}
