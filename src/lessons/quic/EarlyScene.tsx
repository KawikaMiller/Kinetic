import { useMemo, useState, type ReactNode } from 'react';
import { Box, SectionTitle } from '../../components/Panel';
import { SequenceDiagram } from '../../components/SequenceDiagram';
import { StageFrame } from '../../components/StageFrame';
import { Button, Legend, Provenance, ProvenanceRow, Segmented, Stat, Stats } from '../../components/ui';
import type { SeqMessage } from '../../core/sequenceLayout';
import { deliveryText, earlyIntro, earlyRunOf, msText } from './captions';
import { IDEMPOTENCY_KEY, MAX_REPLAYS, POLICIES, POLICY_LABEL, REQUESTS, REQUEST_LABEL, REQUEST_NOTE } from './earlyData';
import { DEFAULT_THINK, initialEarly, replay, type EarlyState } from './init';
import { NetControls } from './NetControls';

const REQUEST_OPTIONS = REQUESTS.map((r) => ({ value: r, label: `${REQUEST_LABEL[r]} (${REQUEST_NOTE[r]})` }));
const POLICY_OPTIONS = POLICIES.map((p) => ({ value: p, label: POLICY_LABEL[p] }));

const LEGEND = (
  <Legend
    items={[
      { color: 'var(--hi)', label: 'the request in the first flight' },
      { color: 'var(--bad)', label: 'work done more than once for a request that is not safe to repeat' },
      { color: 'var(--ok)', label: 'the request handled once' },
    ]}
  />
);

export function EarlyScene({ picker }: { picker: ReactNode }) {
  const [st, setSt] = useState<EarlyState>(initialEarly);
  const run = useMemo(() => earlyRunOf(st, DEFAULT_THINK), [st]);
  const req = REQUEST_LABEL[st.request];
  const messages: SeqMessage[] = [
    { id: 'first', from: 'client', to: 'server', label: `Initial + 0-RTT: ${req}${st.policy === 'idempotency-key' && st.request === 'post' ? `, key ${IDEMPOTENCY_KEY}` : ''}` },
    ...Array.from({ length: st.replays }, (_, i) => ({ id: `copy${i}`, from: 'client', to: 'server', label: 'the same flight, delivered again', note: `copy ${i + 1}` })),
    ...(run.retried
      ? [
          { id: 'refuse', from: 'server', to: 'client', label: 'refused: not in early data' },
          { id: 'again', from: 'client', to: 'server', label: `${req}, after the handshake` },
        ]
      : []),
  ];
  const unsafe = st.request === 'post';
  const work = unsafe ? 'Charges made' : 'Catalogue reads';
  const bad = unsafe && run.applied > 1;

  return (
    <StageFrame
      height={560}
      legend={LEGEND}
      intro={earlyIntro(st, run)}
      introKey={[st.rttMs, st.request, st.policy, st.replays]}
      stats={
        <Stats>
          <Stat label={work} value={run.applied} color={bad ? 'var(--bad)' : unsafe ? 'var(--ok)' : undefined} sub={bad ? 'the same request, done again' : 'by the server'} />
          <Stat label="Copies delivered" value={1 + st.replays} sub={`the original and ${st.replays} replayed`} />
          <Stat label="First byte at" value={msText(run.firstByteMs)} sub={run.retried ? 'after a retry past the handshake' : '0-RTT: the request left with the first flight'} />
        </Stats>
      }
      controls={[
        <>
          {picker}
          <Segmented label="Request" value={st.request} options={REQUEST_OPTIONS} onChange={(request) => setSt((s) => ({ ...s, request }))} />
        </>,
        <>
          <Segmented label="Server and client" value={st.policy} options={POLICY_OPTIONS} onChange={(policy) => setSt((s) => ({ ...s, policy }))} />
        </>,
        <>
          <Button variant="primary" softDisabled={st.replays >= MAX_REPLAYS} onClick={() => setSt(replay)}>
            Replay the first flight
          </Button>
          <NetControls rttMs={st.rttMs} onRtt={(rttMs) => setSt((s) => ({ ...s, rttMs }))} />
          <Button onClick={() => setSt(initialEarly())}>Reset</Button>
        </>,
      ]}
    >
      <div className="qc-stage stage-pad">
        <Box>
          <SectionTitle hint="a copy of the first flight is an abstract duplicate on the path: no mechanism is shown">What reaches the server</SectionTitle>
          <SequenceDiagram actors={[{ id: 'client', label: 'client' }, { id: 'server', label: 'server' }]} messages={messages} ariaLabel="The first flight, any replayed copies, and what the server answers" />
        </Box>
        <Box>
          <SectionTitle hint={`${POLICY_LABEL[st.policy]}`}>What the server did with each copy</SectionTitle>
          <table className="data-table qc-table">
            <thead>
              <tr>
                <th scope="col">Delivery</th>
                <th scope="col">Outcome</th>
              </tr>
            </thead>
            <tbody>
              {run.deliveries.map((d, i) => (
                <tr key={i} className={d.outcome === 'applied-again' && unsafe ? 'qc-row-bad' : undefined}>
                  <td>{d.outcome === 'retried' ? 'retry' : d.copy === 0 ? 'original' : `copy ${d.copy}`}</td>
                  <td>{deliveryText(d)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Box>
        <ProvenanceRow>
          <Provenance kind="scripted">the replay is a button, not an attack: it re-delivers the same flight</Provenance>
          <Provenance kind="from-memory">early data has no replay protection by itself; TLS 1.3 (RFC 8446) and QUIC's use of it (RFC 9001) say so, and RFC 8470 describes a 425 Too Early answer: verify</Provenance>
          <Provenance kind="not-run">shown, not run: no real handshake or server</Provenance>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}
