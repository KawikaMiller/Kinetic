import { useMemo, useState, type ReactNode } from 'react';
import { Box, SectionTitle } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { Button, ChipButton, ControlGroup, Hint, Legend, Provenance, ProvenanceRow, Stat, Stats } from '../../components/ui';
import { useIntroCaption } from '../../core/caption';
import type { LaneModel } from '../../core/laneEditor';
import { vectorText } from './clocks';
import { compareCaption } from './captions';
import { ExecutionEditor, type Picks } from './ExecutionEditor';
import { PRESETS, RELATION_TEXT, pairView, viewOf, type EvData } from './execution';
import type { ExecutionState } from './useExecution';

/** How many of the misleading pairs the "find me a pair" list shows at once. */
const LIST_MAX = 8;

export function CompareScene({ picker, exec }: { picker: ReactNode; exec: ExecutionState }) {
  const [picks, setPicks] = useState<Picks>({ a: null, b: null });
  const [listed, setListed] = useState(false);
  const { model } = exec;
  const view = useMemo(() => viewOf(model), [model]);
  // A pick that no longer exists (the event was deleted) is dropped.
  const a = picks.a !== null && view.byId.has(picks.a) ? view.byId.get(picks.a)! : null;
  const b = picks.b !== null && view.byId.has(picks.b) ? view.byId.get(picks.b)! : null;
  const pair = a !== null && b !== null && a !== b ? pairView(view, a, b) : null;
  const names = (i: number) => view.name(i);

  useIntroCaption(compareCaption(view, a, b, pair), [model, picks]);

  const onChange = (next: LaneModel<EvData>) => {
    exec.change(next);
    if (next.selected && next.selected !== model.selected) {
      // The first press picks a, the second picks b, the third starts over with a.
      setPicks((p) => (p.a === null || p.b !== null ? { a: next.selected, b: null } : p.a === next.selected ? p : { ...p, b: next.selected }));
    }
  };
  const pickPair = (x: number, y: number) => {
    const ids = [...view.byId.entries()];
    setPicks({ a: ids.find(([, i]) => i === x)![0], b: ids.find(([, i]) => i === y)![0] });
  };
  const shown = view.misleading.slice(0, LIST_MAX);

  return (
    <StageFrame
      height={380}
      stats={
        <Stats>
          <Stat label="Ground truth" value={pair ? RELATION_TEXT[pair.truth](names(a!), names(b!)) : '–'} color={pair ? (pair.truth === 'concurrent' ? 'var(--orange)' : 'var(--ok)') : undefined} sub="paths through process order and messages" />
          <Stat
            label="Lamport says"
            value={pair ? (pair.lamport === 'before' ? `${names(a!)} before ${names(b!)}` : `${names(b!)} before ${names(a!)}`) : '–'}
            color={pair?.lamportMisleads ? 'var(--bad)' : undefined}
            sub={pair ? `L ${view.stamps[a!].lamport} against ${view.stamps[b!].lamport}${pair.lamportMisleads ? ': an order that is not there' : ''}` : 'it always orders, it cannot say concurrent'}
          />
          <Stat
            label="Vector says"
            value={pair ? RELATION_TEXT[pair.vector](names(a!), names(b!)) : '–'}
            color={pair ? (pair.vectorWrong ? 'var(--bad)' : pair.vector === 'concurrent' ? 'var(--orange)' : 'var(--ok)') : undefined}
            sub={pair ? `${vectorText(view.stamps[a!].vector)} against ${vectorText(view.stamps[b!].vector)}` : 'incomparable means concurrent'}
          />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--ok)', label: 'happened before' },
            { color: 'var(--orange)', label: 'concurrent' },
            { color: 'var(--bad)', label: 'a clock that is wrong about the truth' },
            { color: 'var(--hi)', label: 'the two events you picked (a, then b)' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <ControlGroup label="Presets" inline>
            {PRESETS.map((p) => (
              <ChipButton key={p.id} tone="info" size="md" on={exec.loaded === p.id} onClick={() => { exec.load(p); setPicks({ a: null, b: null }); }}>{p.label}</ChipButton>
            ))}
          </ControlGroup>
        </>,
        <>
          <Button onClick={() => setListed(true)}>Find me a pair</Button>
          <Button disabled={a === null && b === null} onClick={() => setPicks({ a: null, b: null })}>Clear the pair</Button>
        </>,
      ]}
    >
      <div className="lc-stage stage-pad">
        <ExecutionEditor model={model} onChange={onChange} onRefuse={exec.setMessage} mode="edit" view={view} showStamps picks={picks} ariaLabel="Pick two events to compare" />
        <p className="lc-status" role="status">{exec.message || 'Press an event to pick it. The first press is a, the second is b.'}</p>
        <Box>
          <SectionTitle>The two theorems, with their direction</SectionTitle>
          <ul className="lc-rule-list">
            <li><b>Lamport:</b> a happened before b implies L(a) &lt; L(b). The reverse does not hold.</li>
            <li><b>Vector:</b> a happened before b if and only if V(a) &lt; V(b); incomparable vectors mean concurrent.</li>
          </ul>
        </Box>
        {listed && (
          <Box>
            <SectionTitle hint="L(a) < L(b) although a did not happen before b">Pairs where Lamport misleads</SectionTitle>
            {shown.length === 0 ? (
              <Hint tone="muted">None in this drawing: every pair with a smaller Lamport stamp really is ordered. Draw two events with no message path between them to make one.</Hint>
            ) : (
              <div className="lc-pairs" role="group" aria-label="Pairs where Lamport misleads">
                {shown.map((p) => (
                  <ChipButton key={`${p.a}-${p.b}`} tone="orange" onClick={() => pickPair(p.a, p.b)}>{`${names(p.a)} and ${names(p.b)}`}</ChipButton>
                ))}
                {view.misleading.length > LIST_MAX && <Hint>and {view.misleading.length - LIST_MAX} more</Hint>}
              </div>
            )}
          </Box>
        )}
        <ProvenanceRow>
          <Provenance kind="illustrative">the executions are drawn by you or hand-built presets</Provenance>
          <Provenance kind="toy">the ground truth is computed from the graph alone, then compared with each clock</Provenance>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}
