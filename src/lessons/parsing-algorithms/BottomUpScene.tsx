import { useMemo, useState, type ReactNode } from 'react';
import { CellGrid } from '../../components/CellGrid';
import { GraphView, type GraphEdge, type GraphNode } from '../../components/GraphView';
import { SectionTitle } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { Legend, Provenance, ProvenanceRow, Stat, Stats } from '../../components/ui';
import { WideRegion } from '../../components/WideRegion';
import { bottomUpCaption } from './captions';
import { END, cellKey, prodText } from './grammar';
import { GrammarEditor } from './GrammarEditor';
import { actionText, itemText, lrConflicts, type Action } from './lr';
import { OPENING } from './opening';
import { useGrammarInput, useParsingModel } from './useGrammar';

const CELL_PX = 50;
const AUTOMATON_SPACING = { layerGap: 96, nodeGap: 54, padMain: 44, padCross: 36 };
const GRAPH_MIN_WIDTH = 520;

/** Scene 2: the LR(0) automaton, the SLR tables built from it, and a choice for every conflict. */
export function BottomUpScene({ picker }: { picker: ReactNode }) {
  const grammarInput = useGrammarInput(OPENING.bottomup.preset);
  const g = grammarInput.grammar;
  const model = useParsingModel(g);
  const { automaton, lr } = model;
  const [choiceState, setChoiceState] = useState<{ source: string; map: Record<string, number> }>({ source: g.source, map: {} });
  const choices = choiceState.source === g.source ? choiceState.map : {};
  const [selectedState, setSelectedState] = useState(0);
  const conflicts = useMemo(() => lrConflicts(lr), [lr]);
  const unresolved = conflicts.filter((k) => choices[k] === undefined).length;
  const columns = useMemo(() => [...g.terminals, END, ...g.nonterminals], [g]);
  const state = automaton.states[Math.min(selectedState, automaton.states.length - 1)];

  const preset = (id: string) => {
    grammarInput.loadPreset(id);
    setSelectedState(0);
  };
  const cycle = (key: string) => {
    const options = lr.actions.get(key)!.length;
    const current = choices[key];
    const next = current === undefined ? 0 : current + 1 >= options ? undefined : current + 1;
    const map = { ...choices };
    if (next === undefined) delete map[key];
    else map[key] = next;
    setChoiceState({ source: g.source, map });
  };
  const textOf = (cell: readonly Action[], key: string) => (cell.length > 1 && choices[key] !== undefined ? actionText(cell[choices[key]]) : cell.map(actionText).join('/'));

  const nodes: GraphNode<number>[] = automaton.states.map((s) => ({ id: s.id, label: s.id }));
  const edges: GraphEdge<number>[] = automaton.edges.map((e) => ({ from: e.from, to: e.to, label: e.symbol }));
  const conflictStates = new Set(conflicts.map((k) => Number(k.split('\u0000')[0])));

  return (
    <StageFrame
      height={560}
      intro={bottomUpCaption({ states: automaton.states.length, conflictCells: conflicts.length, unresolved })}
      introKey={`${g.source}|${unresolved}`}
      stats={
        <Stats>
          <Stat label="States" value={automaton.states.length} color="var(--violet)" sub="LR(0) item sets" />
          <Stat label="Conflict cells" value={conflicts.length} color={conflicts.length ? 'var(--bad)' : 'var(--ok)'} sub={conflicts.length ? `${unresolved} still need a choice` : 'the grammar is SLR(1)'} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--bad)', label: 'conflict, no choice yet', shape: 'square' },
            { color: 'var(--ok)', label: 'conflict, choice made', shape: 'square' },
            { color: 'var(--info)', label: 'ACTION cell', shape: 'square' },
            { color: 'var(--violet)', label: 'GOTO cell', shape: 'square' },
          ]}
        />
      }
      controls={[
        picker,
        <>
          <GrammarEditor input={grammarInput} analysis={model.analysis} onPreset={preset} />
        </>,
      ]}
    >
      <div className="pa-stage stage-pad">
        <SectionTitle>LR(0) automaton (click a state for its items)</SectionTitle>
        <WideRegion minWidth={GRAPH_MIN_WIDTH} label="LR automaton: scroll sideways to see all of it">
          <GraphView
            nodes={nodes}
            edges={edges}
            directed
            layout="layered"
            spacing={AUTOMATON_SPACING}
            startNode={0}
            labelHalo
            className="pa-graph"
            ariaLabel={`LR(0) automaton with ${automaton.states.length} states`}
            nodeMark={(id) => (id === state.id ? { tone: 'hi', fill: 'solid' } : conflictStates.has(id) ? { tone: 'bad', fill: 'tint' } : null)}
            onNodeClick={setSelectedState}
            nodeAriaLabel={(id) => `State ${id}`}
          />
        </WideRegion>
        <div className="pa-items" aria-live="polite">
          <b>State {state.id}</b>
          <ul>
            {state.items.map((i) => (
              <li key={`${i.prod}.${i.dot}`}>
                <code>{itemText(automaton, i)}</code>
              </li>
            ))}
          </ul>
        </div>
        <SectionTitle>ACTION and GOTO tables (click a conflict to choose)</SectionTitle>
        <WideRegion minWidth={Math.max(380, columns.length * CELL_PX + 70)} label="SLR tables: scroll sideways to see all of them">
          <CellGrid
            rows={automaton.states.length}
            cols={columns.length}
            size={{ cell: CELL_PX }}
            rowLabels={automaton.states.map((s) => String(s.id))}
            colLabels={columns}
            ariaLabel="SLR ACTION and GOTO tables"
            cell={(r, c) => {
              const key = cellKey(String(r), columns[c]);
              const cell = lr.actions.get(key);
              if (cell) {
                const conflict = cell.length > 1;
                return { text: textOf(cell, key), tone: conflict ? (choices[key] === undefined ? 'bad' : 'ok') : 'info', fill: 'tint' };
              }
              const goto = lr.gotos.get(key);
              return goto === undefined ? { text: '', fill: 'none' } : { text: String(goto), tone: 'violet', fill: 'tint' };
            }}
            onCellClick={(r, c) => {
              const key = cellKey(String(r), columns[c]);
              if ((lr.actions.get(key)?.length ?? 0) > 1) cycle(key);
              else setSelectedState(r);
            }}
            cellAriaLabel={(r, c) => {
              const key = cellKey(String(r), columns[c]);
              const cell = lr.actions.get(key);
              const sym = columns[c] === END ? 'end of input' : columns[c];
              if (cell) return `State ${r} on ${sym}: ${cell.length > 1 ? `conflict between ${cell.map(actionText).join(' and ')}, ${choices[key] === undefined ? 'no choice yet' : `chosen ${actionText(cell[choices[key]])}`}` : actionText(cell[0])}`;
              return `State ${r} on ${sym}: ${lr.gotos.has(key) ? `goto ${lr.gotos.get(key)}` : 'empty'}`;
            }}
          />
        </WideRegion>
        {conflicts.length ? (
          <p className="pa-detail">Your choices are recorded here and recolour the cell; no parse is run from this table. The precedence scene runs them.</p>
        ) : null}
        <ol className="pa-rules">
          {g.productions.map((p) => (
            <li key={p.id}>
              <code>{prodText(p)}</code>
            </li>
          ))}
        </ol>
      </div>
      <ProvenanceRow>
        <Provenance kind="toy">SLR(1) as in the textbook; real generators use stronger lookahead (LALR(1) or LR(1))</Provenance>
        <Provenance kind="from-memory">yacc and Bison generate LALR(1) parsers, ANTLR generates adaptive LL parsers, tree-sitter is LR-family with error recovery: check each project's documentation</Provenance>
      </ProvenanceRow>
    </StageFrame>
  );
}
