import { useAsyncValue } from '../../core/useAsyncValue';
import type { Party } from './ratchet';
import { PROTECTION_LABEL, compareModes, opensText, type Analysis } from './model';

/** One row of cells under the conversation: sealed to the thief, readable by the thief, or sent before the theft. */
export function MarkRow({ pattern, k, analysis }: { pattern: readonly Party[]; k: number; analysis: Analysis | null }) {
  return (
    <div className="e2-marks" role="list" aria-label="What the thief can do with each message">
      {pattern.map((sender, i) => {
        const before = i < k;
        const readable = analysis?.readable[i] ?? false;
        const state = before ? 'sent before the theft: sealed' : readable ? 'readable by the thief' : 'sealed to the thief';
        const cls = analysis === null ? '' : before ? 'is-past' : readable ? 'is-bad' : 'is-ok';
        return (
          <div key={i} role="listitem" className={`e2-mark ${cls}`} aria-label={`message ${i + 1} from ${sender === 'A' ? 'Alice' : 'Bob'}: ${state}`}>
            <b>m{i + 1}</b>
            <span>{sender === 'A' ? 'Alice' : 'Bob'}</span>
            <span>{analysis === null ? '...' : before ? 'before' : readable ? 'readable' : 'sealed'}</span>
            {i === k - 1 && <span className="e2-stolen">stolen here</span>}
          </div>
        );
      })}
    </div>
  );
}

/** The three protections under the same theft, always visible under scenes 1 and 2. */
export function ModeComparison({ pattern, party, k }: { pattern: readonly Party[]; party: Party; k: number }) {
  const key = `${pattern.join('')}|${party}|${k}`;
  const rows = useAsyncValue(() => compareModes(pattern, party, k), key, { keepPrevious: true });
  return (
    <div className="e2-compare" aria-label="The same theft against three protections">
      <b>The same theft, three protections (derivation closure)</b>
      <ul>
        {(rows ?? []).map((r) => (
          <li key={r.protection} className={r.protection === 'fixed' ? 'is-bad' : r.protection === 'full' ? 'is-ok' : ''}>
            <b>{PROTECTION_LABEL[r.protection]}:</b> opens {opensText(r.opens)}
          </li>
        ))}
      </ul>
    </div>
  );
}
