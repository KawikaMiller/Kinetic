import { useMemo } from 'react';
import { CellGrid } from '../../components/CellGrid';
import { Box, SectionTitle } from '../../components/Panel';
import { SequenceDiagram } from '../../components/SequenceDiagram';
import { Legend, Stat, Stats } from '../../components/ui';
import type { Tone } from '../../core/tone';
import type { OutboxRun } from './outbox';
import { ACTORS, sequenceAt, stateAt, type OutboxRowState } from './view';

const CELL = { cell: 52, font: 12 } as const;
const STATE_TONE: Record<OutboxRowState, Tone> = { open: 'dim', unsent: 'hi', sent: 'ok' };
const STATE_WORD: Record<OutboxRowState, string> = { open: 'open', unsent: 'unsent', sent: 'sent' };

export const OUTBOX_LEGEND = (
  <Legend
    items={[
      { color: 'var(--ok)', label: 'a committed order, or an outbox row that is sent' },
      { color: 'var(--hi)', label: 'an outbox row not yet sent' },
      { color: 'var(--violet)', label: 'the atomic boundary: the order and its outbox row commit together' },
      { color: 'var(--orange)', label: 'a duplicate delivery (expected)' },
      { color: 'var(--bad)', label: 'a ghost event, or a committed order whose event never comes' },
    ]}
  />
);

/** The stats row of an outbox scene at moment `now`. */
export function OutboxStats({ run, now }: { run: OutboxRun; now: number }) {
  const s = stateAt(run, now);
  const applied = s.effects.reduce((n, e) => n + e.applied, 0);
  const ignored = s.effects.reduce((n, e) => n + e.ignored, 0);
  const ghosts = s.effects.filter((e) => !s.orders.some((o) => o.order === e.order)).length;
  const unpublished = s.orders.filter((o) => !run.published.some((p) => p.order === o.order && p.at <= now)).length;
  return (
    <Stats>
      <Stat label="Orders committed" value={s.orders.length} color={s.orders.length > 0 ? 'var(--ok)' : undefined} sub="rows in the database" />
      <Stat label="Events published" value={s.published} sub="handed to the broker, repeats included" />
      <Stat label="Effects applied" value={applied} color={applied > s.orders.length ? 'var(--orange)' : undefined} sub={ignored > 0 ? `and ${ignored} repeat${ignored === 1 ? '' : 's'} skipped by the inbox` : 'by the consumer'} />
      <Stat label="Ghost events" value={ghosts} color={ghosts > 0 ? 'var(--bad)' : undefined} sub="handled, with no order behind them" />
      <Stat label="Orders without an event yet" value={unpublished} color={unpublished > 0 ? 'var(--hi)' : undefined} sub="committed, not yet published" />
    </Stats>
  );
}

function Empty({ what }: { what: string }) {
  return <p className="ob-empty">{what}</p>;
}

/** The three tables and the ladder diagram of a run at moment `now`. */
export function OutboxPanels({ run, now, showOutbox = true }: { run: OutboxRun; now: number; showOutbox?: boolean }) {
  const s = stateAt(run, now);
  const sequence = useMemo(() => sequenceAt(run, now), [run, now]);
  return (
    <>
      <div className="ob-tables">
        <Box>
          <SectionTitle hint="the orders table">Database: orders</SectionTitle>
          {s.orders.length === 0 ? (
            <Empty what="No order is committed." />
          ) : (
            <CellGrid
              rows={s.orders.length}
              cols={2}
              size={CELL}
              colLabels={['order', 'amount']}
              cell={(r, c) => (c === 0 ? { text: `#${s.orders[r].order}`, tone: 'ok', fill: 'tint', intensity: 0.4 } : { text: s.orders[r].amount, fill: 'none' })}
              ariaLabel={`Orders table: ${s.orders.length} rows`}
            />
          )}
        </Box>
        {showOutbox && (
          <Box>
            <SectionTitle hint="the same transaction">Database: outbox</SectionTitle>
            {s.outbox.length === 0 ? (
              <Empty what="No outbox row yet." />
            ) : (
              <CellGrid
                rows={s.outbox.length}
                cols={3}
                size={CELL}
                colLabels={['id', 'order', 'state']}
                rowDecor={(r) => ({ tone: STATE_TONE[s.outbox[r].state], style: 'rail' })}
                cell={(r, c) => {
                  const row = s.outbox[r];
                  if (c === 0) return { text: row.id, tone: 'violet', fill: 'tint', intensity: 0.4 };
                  if (c === 1) return { text: `#${row.order}`, fill: 'none' };
                  return { text: STATE_WORD[row.state], tone: STATE_TONE[row.state], fill: 'tint', intensity: 0.4 };
                }}
                ariaLabel={`Outbox table: ${s.outbox.length} rows, ${s.outbox.filter((r) => r.state === 'sent').length} sent`}
              />
            )}
          </Box>
        )}
        <Box>
          <SectionTitle hint="what the consumer did">Consumer</SectionTitle>
          {s.effects.length === 0 ? (
            <Empty what="No event handled yet." />
          ) : (
            <CellGrid
              rows={s.effects.length}
              cols={3}
              size={CELL}
              colLabels={['order', 'applied', 'skipped']}
              cell={(r, c) => {
                const e = s.effects[r];
                const exists = s.orders.some((o) => o.order === e.order);
                if (c === 0) return { text: `#${e.order}`, tone: exists ? 'ok' : 'bad', fill: 'tint', intensity: 0.4 };
                if (c === 1) return { text: e.applied, tone: e.applied > 1 ? 'orange' : 'ok', fill: 'tint', intensity: 0.4 };
                return { text: e.ignored, tone: 'dim', fill: e.ignored > 0 ? 'tint' : 'none', intensity: 0.3 };
              }}
              ariaLabel={`Consumer: ${s.effects.length} orders handled`}
            />
          )}
        </Box>
      </div>
      <Box>
        <SectionTitle hint="empty polls by the relay are left out">Messages so far</SectionTitle>
        <SequenceDiagram actors={ACTORS} messages={sequence.messages} ariaLabel="Messages between the service, database, relay, broker and consumer" />
      </Box>
    </>
  );
}
