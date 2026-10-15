import type { ReactNode } from 'react';
import { StageFrame } from '../../components/StageFrame';
import { ClaimLabel, Provenance, ProvenanceRow } from '../../components/ui';
import { useIntroCaption } from '../../core/caption';

interface Card {
  title: string;
  tradeOff: string;
  note: ReactNode;
}

const CARDS: Card[] = [
  {
    title: 'A database materialized view',
    tradeOff: 'Reads are cheap, and the data is as old as the last refresh.',
    note: <>The database stores the query's result and you refresh it on demand or on a schedule. In PostgreSQL a materialized view is refreshed on demand, and <code>REFRESH ... CONCURRENTLY</code> needs a unique index <ClaimLabel kind="practice">from memory: check the PostgreSQL documentation</ClaimLabel></>,
  },
  {
    title: 'A table kept up by triggers',
    tradeOff: 'It is fresh after every write, but every write pays and a trigger bug drifts quietly.',
    note: <>This is the incremental strategy of the lesson, written by hand. The refund bug in the tests is the kind of mistake it invites.</>,
  },
  {
    title: 'A cache',
    tradeOff: 'It is the cheapest to read, and knowing when to throw an entry away is the hard part.',
    note: <>The cache holds the answer, not a table you can query. Invalidation is its own lesson: <code>caching-patterns</code>.</>,
  },
  {
    title: 'A read model fed by events',
    tradeOff: 'It is rebuilt from a stream of changes, so it lags the writes and can be shaped for each reader.',
    note: <>The read side is derived from an event log and is eventually consistent: <code>event-sourcing</code>.</>,
  },
];

/** Four places a precomputed answer can live, named with the one trade-off each makes. */
export function CardsScene({ picker }: { picker: ReactNode }) {
  useIntroCaption(<>Four ways to keep a precomputed answer. They differ in where it lives and in when it is brought up to date: the trade-off in the lesson, fresh reads against cheap writes, is the same one in each.</>, []);
  return (
    <StageFrame height={320} controls={[<>{picker}</>]}>
      <div className="mv-stage stage-pad">
        <ul className="mv-cards">
          {CARDS.map((c) => (
            <li key={c.title} className="mv-card">
              <b>{c.title}</b>
              <span className="mv-card-tradeoff">{c.tradeOff}</span>
              <span className="mv-card-note">{c.note}</span>
            </li>
          ))}
        </ul>
        <ProvenanceRow>
          <Provenance kind="from-memory">vendor behaviour on these cards is as remembered: check the documentation before relying on it</Provenance>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}
