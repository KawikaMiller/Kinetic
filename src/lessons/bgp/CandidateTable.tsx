import { SortTh } from '../../components/ui';
import { useSortedRows } from '../../components/useSortedRows';
import { asName } from './asgraph';
import type { Candidate, CandidateStatus } from './bgp';
import { pathText } from './captions';

const STATUS_TEXT: Record<CandidateStatus, string> = {
  chosen: 'chosen',
  candidate: 'not chosen',
  loop: 'loop: discarded',
  invalid: 'invalid: dropped',
};

const COLUMNS = {
  via: (c: Candidate) => c.from,
  rel: (c: Candidate) => c.rel,
  pref: (c: Candidate) => c.pref,
  len: (c: Candidate) => c.path.length,
  status: (c: Candidate) => STATUS_TEXT[c.status],
};

/** The routes an AS has been sent, one per neighbour, with the one it chose lit. */
export function CandidateTable({ candidates, caption }: { candidates: readonly Candidate[]; caption: string }) {
  const { sorted, headerProps } = useSortedRows(candidates, COLUMNS);
  return (
    <div className="bgp-scroll" role="region" aria-label={caption} tabIndex={0}>
      <table className="data-table bgp-table">
        <thead>
          <tr>
            <SortTh {...headerProps('via')}>From</SortTh>
            <SortTh {...headerProps('rel')}>Is my</SortTh>
            <SortTh {...headerProps('pref')}>Pref</SortTh>
            <SortTh {...headerProps('len')}>Len</SortTh>
            <th scope="col">AS_PATH</th>
            <SortTh {...headerProps('status')}>Decision</SortTh>
          </tr>
        </thead>
        <tbody>
          {sorted.length === 0 && (
            <tr>
              <td colSpan={6}>No neighbour has sent a route yet.</td>
            </tr>
          )}
          {sorted.map((c) => (
            <tr key={c.from} className={`bgp-row is-${c.status}`}>
              <td>{asName(c.from)}</td>
              <td>{c.rel}</td>
              <td>{c.pref}</td>
              <td>{c.path.length}</td>
              <td>{pathText(c.path)}</td>
              <td>{STATUS_TEXT[c.status]}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
