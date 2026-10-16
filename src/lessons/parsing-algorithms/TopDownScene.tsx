import { useMemo, useState, type ReactNode } from 'react';
import { Bar } from '../../components/Bar';
import { CellGrid } from '../../components/CellGrid';
import { SectionTitle } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { Button, Legend, Provenance, ProvenanceRow, Stat, Stats } from '../../components/ui';
import { WideRegion } from '../../components/WideRegion';
import { END, cellKey, conflictCells, leftRecursive, prodText, removeLeftRecursion, tableColumns } from './grammar';
import { GrammarEditor, TokenField } from './GrammarEditor';
import { OPENING } from './opening';
import { PRESETS } from './presets';
import { RECURSION_BUDGET, longestExpansionRun, runTopDown } from './runs';
import { topDownCaption } from './captions';
import { useGrammarInput, useParsingModel, useTokenInput } from './useGrammar';

const CELL_PX = 44;
const TABLE_MIN_WIDTH = 420;

const setText = (s: Set<string>) => [...s].sort().join(', ') || 'none';

/** Scene 1: FIRST and FOLLOW, the predictive table, and what left recursion does to a recursive-descent parser. */
export function TopDownScene({ picker }: { picker: ReactNode }) {
  const grammarInput = useGrammarInput(OPENING.topdown.preset);
  const tokenInput = useTokenInput(OPENING.topdown.tokens);
  const g = grammarInput.grammar;
  const model = useParsingModel(g);
  const [selected, setSelected] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const columns = useMemo(() => tableColumns(g), [g]);
  const conflicts = useMemo(() => conflictCells(model.ll), [model]);
  const recursive = useMemo(() => leftRecursive(g, model.analysis), [g, model]);
  const run = useMemo(() => runTopDown(g, model.ll, tokenInput.tokens), [g, model, tokenInput.tokens]);
  const depth = longestExpansionRun(run.frames);
  const selectedIds = selected ? (model.ll.get(selected) ?? []) : [];

  const preset = (id: string) => {
    grammarInput.loadPreset(id);
    tokenInput.load(PRESETS.find((p) => p.id === id)!.sample);
    setSelected(null);
    setNote(null);
  };
  const removeRecursion = () => {
    const r = removeLeftRecursion(g);
    if (!r.ok) setNote(r.error);
    else if (!r.changed) setNote('There is no left recursion to remove.');
    else {
      grammarInput.setText(r.text);
      setNote('Rewritten: each left-recursive rule became a rule that reads something first, plus a tail rule that may be empty.');
    }
    setSelected(null);
  };

  return (
    <StageFrame
      height={520}
      intro={topDownCaption({ conflictCells: conflicts.length, leftRecursive: recursive, run })}
      introKey={`${g.source}|${tokenInput.tokens.join(' ')}`}
      stats={
        <Stats>
          <Stat label="LL(1)?" value={conflicts.length === 0 ? 'yes' : 'no'} color={conflicts.length === 0 ? 'var(--ok)' : 'var(--bad)'} sub={`${conflicts.length} conflict cells`} />
          <Stat label="Left recursion" value={recursive.length ? recursive.join(', ') : 'none'} color={recursive.length ? 'var(--bad)' : 'var(--ok)'} sub="rules that call themselves first" />
          <Stat label="Expansions in a row" value={`${depth} of ${RECURSION_BUDGET}`} color={run.status === 'budget' ? 'var(--orange)' : 'var(--info)'} sub="without reading a token (the budget)">
            <Bar value={depth} max={RECURSION_BUDGET} tone={run.status === 'budget' ? 'orange' : 'info'} ariaLabel={`${depth} expansions in a row of a budget of ${RECURSION_BUDGET}`} />
          </Stat>
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--bad)', label: 'cell with two rules (conflict)', shape: 'square' },
            { color: 'var(--info)', label: 'cell with one rule', shape: 'square' },
            { color: 'var(--orange)', label: 'recursion budget reached', shape: 'square' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <Button onClick={removeRecursion}>Remove left recursion</Button>
        </>,
        <>
          <GrammarEditor input={grammarInput} analysis={model.analysis} onPreset={preset} />
        </>,
        <>
          <TokenField input={tokenInput} />
        </>,
      ]}
    >
      <div className="pa-stage stage-pad">
        <SectionTitle>FIRST and FOLLOW</SectionTitle>
        <div className="pa-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>Nonterminal</th>
                <th>Empty?</th>
                <th>FIRST</th>
                <th>FOLLOW</th>
              </tr>
            </thead>
            <tbody>
              {g.nonterminals.map((n) => (
                <tr key={n}>
                  <td>
                    <code>{n}</code>
                  </td>
                  <td>{model.analysis.nullable.has(n) ? 'yes' : 'no'}</td>
                  <td>{setText(model.analysis.first.get(n)!)}</td>
                  <td>{setText(model.analysis.follow.get(n)!)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <SectionTitle>Predictive table (the number is the rule; click a cell)</SectionTitle>
        <WideRegion minWidth={Math.max(TABLE_MIN_WIDTH, columns.length * CELL_PX + 90)} label="Predictive table: scroll sideways to see all of it">
          <CellGrid
            rows={g.nonterminals.length}
            cols={columns.length}
            size={{ cell: CELL_PX }}
            rowLabels={g.nonterminals}
            colLabels={columns}
            ariaLabel="Predictive parsing table"
            cell={(r, c) => {
              const ids = model.ll.get(cellKey(g.nonterminals[r], columns[c])) ?? [];
              if (ids.length === 0) return { text: '', fill: 'none' };
              return { text: ids.map((i) => i + 1).join(','), tone: ids.length > 1 ? 'bad' : 'info', fill: 'tint' };
            }}
            highlight={selected ? [{ r: g.nonterminals.indexOf(selected.split('\u0000')[0]), c: columns.indexOf(selected.split('\u0000')[1]), tone: 'hi' }] : []}
            onCellClick={(r, c) => setSelected(cellKey(g.nonterminals[r], columns[c]))}
            cellAriaLabel={(r, c) => {
              const ids = model.ll.get(cellKey(g.nonterminals[r], columns[c])) ?? [];
              return `${g.nonterminals[r]} on ${columns[c] === END ? 'end of input' : columns[c]}: ${ids.length ? `rule ${ids.map((i) => i + 1).join(' and ')}` : 'empty'}`;
            }}
          />
        </WideRegion>
        <p className="pa-detail" aria-live="polite">
          {selected ? (
            selectedIds.length ? (
              <>
                <code>{selected.split('\u0000')[0]}</code> on <code>{selected.split('\u0000')[1]}</code>: {selectedIds.map((i) => prodText(g.productions[i])).join('   and   ')}
                {selectedIds.length > 1 ? ' (a conflict: one token cannot choose between them)' : ''}
              </>
            ) : (
              <>That cell is empty: the parser reports an error there.</>
            )
          ) : (
            <>Pick a cell to read its rules.</>
          )}
        </p>
        <ol className="pa-rules">
          {g.productions.map((p) => (
            <li key={p.id}>
              <code>{prodText(p)}</code>
            </li>
          ))}
        </ol>
        {note ? (
          <p className="pa-detail" role="status">
            {note}
          </p>
        ) : null}
      </div>
      <ProvenanceRow>
        <Provenance kind="toy">LL(1) as in the textbook; real generators use stronger lookahead</Provenance>
        <Provenance kind="from-memory">hand-written recursive descent and Pratt parsing dominate in practice: check before relying on it</Provenance>
      </ProvenanceRow>
    </StageFrame>
  );
}
