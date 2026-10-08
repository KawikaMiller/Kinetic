import { useState, type ReactNode } from 'react';
import { CellGrid } from '../../components/CellGrid';
import { CodePanel } from '../../components/CodePanel';
import { GraphView, type GraphEdge, type GraphNode } from '../../components/GraphView';
import { SectionTitle } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { ChipButton, ControlGroup, Hint, Legend, Stat, Stats, Toggle } from '../../components/ui';
import { WideRegion } from '../../components/WideRegion';
import { useIntroCaption } from '../../core/caption';
import { stateCaption } from './frames';
import {
  FLAGS, FLAGS_CODE, P_EVENTS, P_STATES, REASONS, STATE_CODE, STATE_LABEL, TRANSITIONS, flagRows, isValid, nextState, type PEvent, type PState,
} from './model';

const W = 440;
const H = 260;
const NODES: GraphNode<PState>[] = [
  { id: 'stopped', label: STATE_LABEL.stopped, at: { x: 66, y: 130 }, shape: 'box' },
  { id: 'playing', label: STATE_LABEL.playing, at: { x: 270, y: 130 }, shape: 'box' },
  { id: 'paused', label: STATE_LABEL.paused, at: { x: 270, y: 36 }, shape: 'box' },
  { id: 'buffering', label: STATE_LABEL.buffering, at: { x: 270, y: 224 }, shape: 'box' },
];
const EDGES: (GraphEdge<PState> & { event: PEvent })[] = P_STATES.flatMap((from) =>
  (Object.entries(TRANSITIONS[from]) as [PEvent, PState][]).map(([event, to]) => ({ from, to, label: event, event })),
);
const ROWS = flagRows();
const BOX = { w: 96, h: 40, rx: 10 };
/** Column headings that fit a 30px cell; the hint spells the flags out. */
const COLUMN_ABBREV: Record<PState, string> = { stopped: 'stop', playing: 'play', paused: 'paus', buffering: 'buff' };

export function StateScene({ picker }: { picker: ReactNode }) {
  const [state, setState] = useState<PState>('stopped');
  const [last, setLast] = useState<{ event: PEvent; from: PState } | null>(null);
  const [flags, setFlags] = useState(false);
  const press = (event: PEvent) => {
    setLast({ event, from: state });
    setState(nextState(state, event) ?? state);
  };
  useIntroCaption(stateCaption(state, last), [state, last]);
  const taken = last && isValid(last.from, last.event) ? `${last.from}>${last.event}` : null;
  const refused = P_EVENTS.filter((e) => !isValid(state, e.id));
  const validRows = ROWS.filter((r) => r.means).length;
  const currentRow = ROWS.findIndex((r) => r.means === state);

  return (
    <StageFrame
      height={500}
      stats={
        <Stats>
          <Stat label="Current state" value={STATE_LABEL[state]} color="var(--hi)" />
          <Stat label="Flag combinations" value={ROWS.length} color="var(--muted)" />
          <Stat label="Valid states" value={validRows} color="var(--ok)" />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--hi)', label: 'current state; the transition just taken' },
            { color: 'var(--dim)', label: 'press that does nothing here' },
            { color: 'var(--bad)', label: 'nonsense flag combination' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <ControlGroup label="Press">
            {P_EVENTS.map((e) => (
              <ChipButton key={e.id} tone={isValid(state, e.id) ? 'info' : 'dim'} onClick={() => press(e.id)}>
                {e.label}
              </ChipButton>
            ))}
          </ControlGroup>
          <Toggle label="Same logic as" value={flags} onChange={setFlags} off="a state machine" on="boolean flags" />
        </>,
      ]}
    >
      <div className="bp stage-pad">
        <WideRegion minWidth={440} label="Media player state diagram: scroll sideways to see all of it">
          <GraphView
            nodes={NODES}
            edges={EDGES}
            directed
            startNode="stopped"
            width={W}
            height={H}
            box={BOX}
            className="bp-graph"
            ariaLabel={`Media player state diagram: ${P_STATES.map((s) => STATE_LABEL[s]).join(', ')}; currently ${STATE_LABEL[state]}`}
            nodeMark={(id) => (id === state ? { tone: 'hi', fill: 'solid' } : null)}
            edgeMark={(e) => (taken === `${e.from}>${(e as (typeof EDGES)[number]).event}` ? { tone: 'hi', width: 3 } : null)}
          />
        </WideRegion>
        <div className="bp-reasons" aria-label={`Presses that do nothing while ${STATE_LABEL[state]}`}>
          <SectionTitle weight="regular">Greyed while {STATE_LABEL[state]}</SectionTitle>
          {refused.length ? (
            <ul>
              {refused.map((e) => (
                <li key={e.id}>
                  <b>{e.label}</b>: {REASONS[state][e.id]}
                </li>
              ))}
            </ul>
          ) : (
            <p className="empty-note">every press does something</p>
          )}
        </div>
        {flags ? (
          <div className="bp-row">
            <div className="bp-col">
              <CodePanel title="flags: every handler re-checks the others" lines={FLAGS_CODE} className="bp-code" />
              <Hint block>
                The columns are {P_STATES.map((s) => FLAGS[s]).join(', ')}. Four booleans allow {ROWS.length} combinations, but only {validRows} mean a real state: the other {ROWS.length - validRows} (nothing set, or several) can be written by a
                bug and nothing stops them.
              </Hint>
            </div>
            <CellGrid
              rows={ROWS.length}
              cols={P_STATES.length}
              size={{ cell: 30, gap: 2, font: 10 }}
              colLabels={P_STATES.map((s) => COLUMN_ABBREV[s])}
              cell={(r, c) => ({ text: ROWS[r].flags[P_STATES[c]] ? 'T' : 'F', tone: ROWS[r].means ? 'muted' : 'bad', fill: ROWS[r].means ? 'outline' : 'tint' })}
              highlight={currentRow >= 0 ? P_STATES.map((_, c) => ({ r: currentRow, c, tone: 'hi' as const })) : []}
              rowSuffix={{ width: 110, render: (r) => (ROWS[r].means ? `= ${STATE_LABEL[ROWS[r].means!]}` : '✕ nonsense') }}
              ariaLabel={`All ${ROWS.length} combinations of four state flags: only ${validRows} mean a real state`}
            />
          </div>
        ) : (
          <CodePanel title="a state machine: one table, one state" lines={STATE_CODE} className="bp-code" />
        )}
        <Hint block>
          A scripted player. Pausing while buffering and a drop while paused are refused here as a modelling choice; real players differ. When not to: a single on/off boolean doesn&apos;t
          need a state machine.
        </Hint>
      </div>
    </StageFrame>
  );
}
