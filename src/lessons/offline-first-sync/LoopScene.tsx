import { useMemo, useState, type ReactNode } from 'react';
import { Box, SectionTitle } from '../../components/Panel';
import { SeedField } from '../../components/SeedField';
import { SequenceDiagram } from '../../components/SequenceDiagram';
import { StageFrame } from '../../components/StageFrame';
import { Legend, Provenance, ProvenanceRow, Slider, Stat, Stats } from '../../components/ui';
import { toSequence } from '../../core/distSim';
import { loopCaption } from './captions';
import { initialLoop } from './init';
import type { Msg } from './nodes';
import { LOOP_LIMITS, LOOP_OUTAGE_FROM_MS, loopConfig, loopScript, loopUntil } from './scenarios';
import { runConfig } from './runs';
import { ackedAfter, firstPullSince, pushAttempts } from './status';

const LEGEND = (
  <Legend
    items={[
      { color: 'var(--bad)', label: 'a push lost to the outage' },
      { color: 'var(--ok)', label: 'a push acknowledged' },
      { color: 'var(--info)', label: 'a message in flight' },
    ]}
  />
);
const SEQUENCE_CAP = 18;
const label = (m: Msg): string =>
  m.type === 'push' ? `push ${m.ops.length} edit${m.ops.length === 1 ? '' : 's'}` : m.type === 'ack' ? 'ack' : m.type === 'pull' ? `pull since ${m.since}` : m.type === 'update' ? `update (${m.ops.length} operations)` : m.type;

export function LoopScene({ picker }: { picker: ReactNode }) {
  const [st, setSt] = useState(initialLoop);
  const until = loopUntil(st);
  const run = useMemo(() => runConfig(loopConfig(st, st.seed), until), [st, until]);
  const editTimes = useMemo(() => loopScript(st.edits).map((t) => t.at), [st.edits]);
  const attempts = useMemo(() => pushAttempts(run.trace, 'laptop', editTimes), [run, editTimes]);
  const outageEnd = LOOP_OUTAGE_FROM_MS + st.outageSec * 1000;
  const acked = ackedAfter(run.trace, 'laptop', st.outageSec === 0 ? 0 : outageEnd);
  const since = firstPullSince(run.trace, 'laptop', outageEnd);
  const rows = useMemo(() => run.trace.filter((r) => r.payload && ['push', 'ack', 'pull', 'update'].includes(r.payload.type) && (r.from === 'laptop' || r.to === 'laptop' || r.node === 'laptop') && r.t < outageEnd + 12_000), [run, outageEnd]);
  const seq = useMemo(() => toSequence(rows, { label }), [rows]);
  const messages = seq.messages.filter((m) => !m.label.startsWith('update (0') && !m.label.startsWith('pull')).slice(0, SEQUENCE_CAP);
  const lost = attempts.filter((a) => a.lost).length;
  const longest = attempts.reduce((m, a) => Math.max(m, a.gap ?? 0), 0);
  const patch = (p: Partial<typeof st>) => setSt((s) => ({ ...s, ...p }));

  return (
    <StageFrame
      height={720}
      legend={LEGEND}
      intro={loopCaption(attempts, st.outageSec, acked, since)}
      introKey={`${st.outageSec}|${st.edits}|${st.capSec}|${st.seed}`}
      stats={
        <Stats>
          <Stat label="Pushes sent" value={attempts.length} sub={`${lost} lost to the outage`} />
          <Stat label="Longest gap" value={`${(longest / 1000).toFixed(1)} s`} color={longest > 0 ? 'var(--hi)' : undefined} sub={`between two pushes; the cap is ${st.capSec} s`} />
          <Stat label="Edits confirmed" value={`${run.laptop.acked.size} of ${st.edits}`} color={run.laptop.acked.size === st.edits ? 'var(--ok)' : 'var(--orange)'} sub={`outbox holds ${run.laptop.outbox.length}`} />
          <Stat label="Cursor" value={run.laptop.cursor} sub="how far into the server's log the laptop has read" />
        </Stats>
      }
      controls={[
        <>
          {picker}
          <SeedField seed={st.seed} onSeed={(seed) => patch({ seed })} />
        </>,
        <>
          <Slider label="Network outage" value={st.outageSec} min={LOOP_LIMITS.outageSec.min} max={LOOP_LIMITS.outageSec.max} step={LOOP_LIMITS.outageSec.step} format={(n) => (n === 0 ? 'none' : `${n} s`)} onChange={(outageSec) => patch({ outageSec })} />
          <Slider label="Edits the laptop makes" value={st.edits} min={LOOP_LIMITS.edits.min} max={LOOP_LIMITS.edits.max} step={LOOP_LIMITS.edits.step} onChange={(edits) => patch({ edits })} />
          <Slider label="Retry cap" value={st.capSec} min={LOOP_LIMITS.capSec.min} max={LOOP_LIMITS.capSec.max} step={LOOP_LIMITS.capSec.step} format={(n) => `${n} s`} onChange={(capSec) => patch({ capSec })} />
        </>,
      ]}
    >
      <div className="ofs-stage stage-pad">
        <Box>
          <SectionTitle hint="the laptop's pushes, from the trace: the first retry waits about a second; the longest a wait can be doubles until the cap, and jitter takes up to half of it off">Retry with backoff</SectionTitle>
          <div className="ofs-scroll" role="region" aria-label="The laptop's push attempts" tabIndex={0}>
            <table className="data-table ofs-table">
              <thead>
                <tr>
                  <th scope="col">#</th>
                  <th scope="col">At</th>
                  <th scope="col">Gap since the last</th>
                  <th scope="col">Set off by</th>
                  <th scope="col">Edits in it</th>
                  <th scope="col">Result</th>
                </tr>
              </thead>
              <tbody>
                {attempts.slice(0, 14).map((a) => (
                  <tr key={a.n} className={a.lost ? 'is-lost' : 'is-ok'}>
                    <td>{a.n}</td>
                    <td>{(a.at / 1000).toFixed(1)} s</td>
                    <td>{a.gap === null ? 'first' : `${(a.gap / 1000).toFixed(1)} s`}</td>
                    <td>{a.why === 'edit' ? 'a new edit' : 'the retry timer'}</td>
                    <td>{a.ops}</td>
                    <td>{a.lost ? 'lost' : 'delivered'}</td>
                  </tr>
                ))}
                {attempts.length > 14 && (
                  <tr>
                    <td colSpan={6}>and {attempts.length - 14} more</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Box>
        <Box>
          <SectionTitle hint={`the laptop and the server; the first ${SEQUENCE_CAP} messages, empty pulls left out`}>The messages</SectionTitle>
          {messages.length === 0 ? <p className="ofs-note">Nothing was sent.</p> : <SequenceDiagram actors={seq.actors} messages={messages} ariaLabel="The pushes and replies between the laptop and the server, lost ones marked" />}
        </Box>
        <Box>
          <SectionTitle hint="plain names only: shown, not used">Where the outbox lives</SectionTitle>
          <p className="ofs-note">
            A real client keeps the outbox and its copy of the list in local storage (IndexedDB in a browser, SQLite on a phone) so edits survive a restart, and may ask the platform to sync in the background; support for background-sync APIs is uneven across browsers (from memory: check caniuse). This page stores nothing.
          </p>
        </Box>
        <ProvenanceRow>
          <Provenance kind="simulated" seed={st.seed}>a seeded retry schedule on the distributed-sim harness</Provenance>
          <Provenance kind="from-memory">IndexedDB, SQLite and background-sync support are named from memory; verify at caniuse</Provenance>
          <Provenance kind="not-run">no storage, no service worker and no real request: shown, not run</Provenance>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}
