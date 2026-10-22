import { useMemo, useState, type ReactNode } from 'react';
import { StageFrame } from '../../components/StageFrame';
import { ClaimLabel, Legend, Provenance, ProvenanceRow, Segmented, Stat, Stats } from '../../components/ui';
import { isBad } from '../../core/scenario';
import { ledgerCaption } from './captions';
import { bestOnEvery, bestPathSets, neverRedPaths, pathRows, type PathRow } from './model';
import { OPENING } from './opening';
import { MIGRATION } from './scenario';

const FILTERS = [
  { value: 'all', label: 'All paths' },
  { value: 'calm', label: 'Never red' },
] as const;
type Filter = (typeof FILTERS)[number]['value'];

const choiceLabel = (id: string) => MIGRATION.nodes.flatMap((n) => n.choices).find((c) => c.id === id)!.label;
const endingTitle = (id: string) => MIGRATION.endings.find((e) => e.id === id)!.title;

/** Scene 3: all 28 paths of the story, computed, with what each leaves worse than the start. */
export function LedgerScene({ picker }: { picker: ReactNode }) {
  const [filter, setFilter] = useState<Filter>(OPENING.ledger.filter);
  const rows = useMemo(() => pathRows(MIGRATION), []);
  const calm = neverRedPaths(rows);
  const best = bestPathSets(MIGRATION, rows);
  const shown: readonly PathRow[] = filter === 'calm' ? calm : rows;
  const none = bestOnEvery(MIGRATION, rows).length === 0;

  return (
    <StageFrame
      height={760}
      minWidth={640}
      intro={ledgerCaption(MIGRATION, rows, shown.length)}
      introKey={`${filter}`}
      stats={
        <Stats>
          <Stat label="Paths" value={rows.length} sub="three decisions, plus the one-weekend cutover" />
          <Stat label="Never in the red" value={calm.length} color="var(--ok)" sub="no meter red at any step" />
          <Stat label="Best on every meter" value={none ? 'none' : bestOnEvery(MIGRATION, rows).length} color={none ? 'var(--dim)' : 'var(--ok)'} sub="the best-on-each-meter sets share no path" />
        </Stats>
      }
      legend={<Legend items={[{ color: 'var(--bad)', label: 'a meter in the red when the path ends' }, { color: 'var(--ok)', label: 'a path that was never red' }]} />}
      controls={[<>{picker}<Segmented label="Show" value={filter} options={FILTERS.map((f) => ({ ...f }))} onChange={setFilter} /></>]}
    >
      <div className="sf-stage stage-pad">
        <table className="data-table sf-ledger">
          <caption>Every path: choices in order, the ending, and the four meters at the end</caption>
          <thead>
            <tr>
              <th>Path</th>
              <th>Ending</th>
              {MIGRATION.meters.map((m) => <th key={m.id}>{m.id}</th>)}
              <th>Red at some step</th>
              <th>Worse than the start</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => (
              <tr key={r.key}>
                <td>{r.choices.join(' ')}</td>
                <td>{endingTitle(r.endingId)}</td>
                {MIGRATION.meters.map((m) => <td key={m.id} style={isBad(m, r.meters[m.id]) ? { color: 'var(--bad)' } : undefined}>{r.meters[m.id]}</td>)}
                <td>{r.everRed.length ? r.everRed.join(', ') : <span style={{ color: 'var(--ok)' }}>never</span>}</td>
                <td>{r.worseThanStart.join(', ') || 'none'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <table className="data-table sf-ledger">
          <caption>The paths that end best on each meter (they share none)</caption>
          <thead><tr><th>Meter</th><th>Paths that end best on it</th></tr></thead>
          <tbody>
            {MIGRATION.meters.map((m) => <tr key={m.id}><td>{m.id}</td><td>{best[m.id].join(', ')}</td></tr>)}
          </tbody>
        </table>
        <dl className="sf-key">
          {MIGRATION.nodes.flatMap((n) => n.choices).map((c) => (
            <div key={c.id}><dt>{c.id}</dt><dd>{choiceLabel(c.id)}</dd></div>
          ))}
        </dl>
        <ProvenanceRow>
          <Provenance kind="invented">every effect in the story is a made-up number</Provenance>
          <ClaimLabel kind="view">&quot;migrations stall on the long tail&quot; is one view, shown here as the weeks and strain the tail adds</ClaimLabel>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}
