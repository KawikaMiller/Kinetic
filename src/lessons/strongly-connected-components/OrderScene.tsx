import { useMemo, type ReactNode } from 'react';
import { ArrayStrip } from '../../components/ArrayStrip';
import { Tray } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { ChipButton, ControlGroup, Hint, Legend, Provenance, ProvenanceRow, Stat, Stats } from '../../components/ui';
import { EditRow, PresetChips } from './Controls';
import { useIntroCaption } from '../../core/caption';
import { canonicalPartition } from '../../core/scc';
import { kosaraju } from './model';
import { SccGraph } from './SccGraph';
import { edgeVerdict } from './text';
import { ORDER_CHOICES, type SccEditor } from './useSccEditor';

export function OrderScene({ picker, ed }: { picker: ReactNode; ed: SccEditor }) {
  const g = ed.graph;
  const n = g.names.length;
  const run = useMemo(() => kosaraju(g, ed.order), [g, ed.order]);
  const asGiven = useMemo(() => kosaraju(g), [g]);
  const same = canonicalPartition(run.components) === canonicalPartition(asGiven.components);
  const finishChanged = run.finishOrder.join() !== asGiven.finishOrder.join();
  const choiceOn = (build: (n: number) => number[]) => build(n).join() === ed.order.join();
  const names = (vs: readonly number[]) => vs.map((v) => g.names[v]).join(' ');
  const verdict = ed.last ? edgeVerdict(g.names, ed.last.from, ed.last.to, ed.last.effect) : null;
  useIntroCaption(
    <>
      Pass 1 started in the order {names(ed.order)} and finished {names(run.finishOrder)}; the {run.components.length} components are {same ? 'the same as' : 'different from'} the as-given order&apos;s.
      {verdict ? ` ${verdict}` : ' Drag an edge between two nodes to see whether it fuses components.'}
    </>,
    [ed.order.join(), run.finishOrder.join(), run.components.length, same, verdict],
  );

  return (
    <StageFrame
      height={480}
      stats={
        <Stats>
          <Stat label="Components" value={run.components.length} color="var(--amber)" sub={ed.last ? `${ed.last.effect.before} before your last edge` : 'add an edge to compare'} />
          <Stat label="Finish order" value={names(run.finishOrder)} sub={finishChanged ? 'differs from the as-given order' : 'same as the as-given order'} />
          <Stat label="Same components as as-given" value={same ? 'yes' : 'no'} color={same ? 'var(--ok)' : 'var(--bad)'} sub="compared as sets of sets" />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--amber)', label: 'a component: node colour and hull', shape: 'dot' },
            { color: 'var(--orange)', label: 'the edge you just added', shape: 'line' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <PresetChips ed={ed} />
        </>,
        <>
          <ControlGroup label="Pass-1 start order">
            {ORDER_CHOICES.map((c) => (
              <ChipButton key={c.id} tone="info" on={choiceOn(c.build)} onClick={() => ed.setOrder(c.build(n))}>
                {c.label}
              </ChipButton>
            ))}
          </ControlGroup>
        </>,
        <><EditRow ed={ed} /></>,
      ]}
    >
      <div className="scc-stage stage-pad">
        <div className="scc-main">
          <SccGraph ed={ed} comp={run.comp} markLast ariaLabel={`Directed graph with ${run.components.length} components`} />
        </div>
        <div className="scc-side">
          <Tray label="Start order: press a cell to move it to the front" labelWeight="regular" stack ariaLabel="Pass-1 start order">
            <ArrayStrip
              values={ed.order.map((v) => g.names[v])}
              cellState={() => 'idle'}
              cellMax={52}
              fontSize={13}
              onCellClick={(i) => ed.setOrder([ed.order[i], ...ed.order.filter((_, j) => j !== i)])}
              cellTitle={(i) => `Start pass 1 at ${g.names[ed.order[i]]} first`}
            />
          </Tray>
          <Tray label="Finish order this gives" labelWeight="regular" stack ariaLabel="Finish order">
            <p className="scc-line">{names(run.finishOrder)}</p>
          </Tray>
          <Tray label="Components" labelWeight="regular" stack ariaLabel="Components">
            <p className="scc-line">{run.components.map((c) => `{${names([...c].sort((a, b) => a - b))}}`).join('  ')}</p>
          </Tray>
          <Tray label="The edge you added" labelWeight="regular" stack ariaLabel="Effect of the added edge">
            <p className="scc-line" role="status">
              {verdict ?? 'Drag from one node to another. An edge that closes a cycle between components fuses them; any other edge leaves them be.'}
            </p>
          </Tray>
        </div>
      </div>
      <ProvenanceRow>
        <Provenance kind="real">pass 1 is run again in the order you pick, and the components are compared as sets of sets</Provenance>
      </ProvenanceRow>
      <Hint tone="muted" block>
        The finish order is allowed to change with the start order. The components are a property of the graph, not of the search.
      </Hint>
    </StageFrame>
  );
}
