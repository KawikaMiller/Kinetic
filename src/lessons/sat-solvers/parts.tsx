import type { CSSProperties, ReactNode } from 'react';
import { ClaimLabel, Provenance, ProvenanceRow, Stat, Stats } from '../../components/ui';
import { clauseStatus, clauseText, variableName, type Cnf, type ClauseStatus, type DpllState } from '../../core/sat';

const STATUS_COLOUR: Record<ClauseStatus, string> = { satisfied: 'var(--ok)', unit: 'var(--hi)', falsified: 'var(--bad)', open: 'var(--muted)' };
const STATUS_WORD: Record<ClauseStatus, string> = { satisfied: 'satisfied', unit: 'unit', falsified: 'falsified', open: 'open' };

/** One chip per clause, tinted by where it stands: satisfied, unit (forces a value), falsified, or still open. */
export function ClauseChips({ cnf, values }: { cnf: Cnf; values: DpllState['values'] }) {
  return (
    <ol className="ss-clauses" aria-label="Clauses and their status">
      {cnf.clauses.map((clause, i) => {
        const { status } = clauseStatus(clause, values);
        return (
          <li key={i} className={`chip ss-clause is-${status}`} style={{ '--c': STATUS_COLOUR[status] } as CSSProperties}>
            <span className="ss-clause-no">{i + 1}</span>
            <span className="ss-clause-text">{clauseText(cnf, clause)}</span>
            <span className="ss-clause-status">{STATUS_WORD[status]}</span>
          </li>
        );
      })}
    </ol>
  );
}

/** The trail: each decision and propagation in order, with the clause that forced it. */
export function TrailList({ cnf, trail }: { cnf: Cnf; trail: DpllState['trail'] }) {
  if (trail.length === 0) return <p className="ss-empty">The trail is empty: nothing is decided or forced yet.</p>;
  return (
    <ol className="ss-trail" aria-label="Trail of decisions and propagations">
      {trail.map((t, i) => (
        <li key={i} className={t.reason === 'propagation' ? 'is-forced' : 'is-decided'}>
          {t.reason === 'propagation' && t.clause !== undefined
            ? `clause ${t.clause + 1} ${clauseText(cnf, cnf.clauses[t.clause])} forces ${variableName(cnf, t.var)} = ${t.value ? 'T' : 'F'}`
            : `${t.reason === 'flip' ? 'flip' : 'decide'} ${variableName(cnf, t.var)} = ${t.value ? 'T' : 'F'}`}
        </li>
      ))}
    </ol>
  );
}

export function Counters({ state }: { state: DpllState }) {
  return (
    <Stats>
      <Stat label="Branches" value={state.stats.branches} sub="each tried value of a decision" />
      <Stat label="Propagations" value={state.stats.propagations} sub="each forced value" />
      <Stat label="Conflicts" value={state.stats.conflicts} color={state.stats.conflicts > 0 ? 'var(--bad)' : undefined} sub="each falsified clause found" />
    </Stats>
  );
}

/** The chips every scene wears: a toy, and the DPLL name from memory. */
export function Chips({ seed, children }: { seed?: number; children?: ReactNode }) {
  return (
    <ProvenanceRow>
      {children}
      <Provenance kind="toy">toy sizes; real solvers add clause learning and restarts, which this lesson names and does not build</Provenance>
      <ClaimLabel kind="standard">DPLL is named for Davis, Putnam, Logemann and Loveland; verify against the original papers (1960 and 1962), from memory</ClaimLabel>
      {seed !== undefined && <Provenance kind="simulated" seed={seed}>random 3-SAT formulas, 8 variables and 30 clauses, one seed each (this is the first seed of the window)</Provenance>}
    </ProvenanceRow>
  );
}
