import { useMemo } from 'react';
import { LogStream } from '../../components/LogStream';
import { ConsolePanel } from '../../components/ConsolePanel';
import { Box, SectionTitle } from '../../components/Panel';
import type { AgentEvent, AgentRun } from './agent';
import { eventRows } from './view';

/** The think, act, observe log of a run (or its first `shown` events). */
export function EventLog({ events, shown, title, hint }: { events: readonly AgentEvent[]; shown?: number; title: string; hint?: string }) {
  const rows = useMemo(() => eventRows(shown === undefined ? events : events.slice(0, shown)), [events, shown]);
  return (
    <Box>
      <SectionTitle hint={hint}>{title}</SectionTitle>
      <LogStream label={`${title}: tool calls and results`} rows={rows} maxHeight={250} follow live="off" empty="The loop has not started." />
    </Box>
  );
}

/** What the write tools did: a fake outbox and ledger, nothing leaves the page. */
export function Outbox({ run }: { run: AgentRun }) {
  const lines = run.writes.map((w) => ({
    text: w.call.tool === 'refund' ? `refund: order ${w.call.args.order}, amount ${Number(w.call.args.amount).toFixed(2)}` : `email to ${w.call.args.to}: ${w.call.args.text}`,
    tone: w.requested ? ('ok' as const) : ('bad' as const),
  }));
  return <ConsolePanel title="fake outbox and ledger: nothing is sent" lines={lines} empty="no write has run" />;
}
