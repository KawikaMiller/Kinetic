import { useMemo, useState, type ReactNode } from 'react';
import { Box, SectionTitle } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { WideRegion } from '../../components/WideRegion';
import { Button, ChipButton, ClaimLabel, Hint, Legend, Provenance, ProvenanceRow, Segmented, Slider, Stat, Stats } from '../../components/ui';
import { refocusAfterRemove } from '../../core/refocus';
import { execCaption } from './captions';
import {
  CHAIN, DELAY_MS, NODES, OFFSET_MS, RULE_TEXT, TIME_MS, addLocal, addMessage, eventCount, eventLabels, happenedBefore, hlcText, inversions, sortedBy, stampExecution,
  MAX_EVENTS, MAX_MESSAGES, type Execution, type Scheme,
} from './hlc';
import { TIMELINE_W, Timeline } from './Timeline';

/** Narrowest width, in px, where the six-column event table keeps each stamp on one line. */
const EVENT_TABLE_W = 600;

const NODE_OPTIONS = NODES.map((n, i) => ({ value: i, label: n }));
const SCHEME_LABEL: Record<Scheme, string> = { physical: 'physical clock', lamport: 'Lamport', hlc: 'hybrid' };
const EMPTY: Execution = { offsets: CHAIN.offsets, messages: [], locals: [] };

export function ExecScene({ picker }: { picker: ReactNode }) {
  const [exec, setExec] = useState<Execution>(CHAIN);
  const [from, setFrom] = useState(0);
  const [to, setTo] = useState(1);
  const [sendAt, setSendAt] = useState(100);
  const [delay, setDelay] = useState(5);
  const [localNode, setLocalNode] = useState(1);
  const [localAt, setLocalAt] = useState(110);
  const [refusal, setRefusal] = useState<string | null>(null);

  const stamps = useMemo(() => stampExecution(exec), [exec]);
  const hb = useMemo(() => happenedBefore(exec), [exec]);
  const labels = useMemo(() => eventLabels(stamps.map((s) => s.event)), [stamps]);
  const counts = useMemo(
    () => ({ physical: inversions(stamps, hb, 'physical'), lamport: inversions(stamps, hb, 'lamport'), hlc: inversions(stamps, hb, 'hlc') }),
    [stamps, hb],
  );
  const inverted = useMemo(() => new Set(counts.physical.map((p) => p.effect)), [counts]);
  const order = useMemo(() => ({ physical: sortedBy('physical', stamps), lamport: sortedBy('lamport', stamps), hlc: sortedBy('hlc', stamps) }), [stamps]);

  const apply = (edit: ReturnType<typeof addMessage>) => {
    if (edit.ok) {
      setExec(edit.exec);
      setRefusal(null);
    } else setRefusal(edit.reason);
  };
  const offset = (i: number, v: number) => {
    setExec({ ...exec, offsets: exec.offsets.map((o, k) => (k === i ? v : o)) as unknown as Execution['offsets'] });
    setRefusal(null);
  };

  return (
    <StageFrame
      height={470}
      intro={execCaption({ stamps, inv: counts, refusal })}
      introKey={`${JSON.stringify(exec)}|${refusal ?? ''}`}
      stats={
        <Stats>
          {(['physical', 'lamport', 'hlc'] as const).map((s) => (
            <Stat key={s} label={`Causal inversions, ${SCHEME_LABEL[s]}`} value={counts[s].length} color={counts[s].length > 0 ? 'var(--bad)' : 'var(--ok)'} sub="pairs where the cause has the larger stamp" />
          ))}
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--dim)', label: 'a physical stamp' },
            { color: 'var(--info)', label: 'a Lamport stamp and a message' },
            { color: 'var(--hi)', label: 'a hybrid (l, c) stamp' },
            { color: 'var(--violet)', label: 'its counter c' },
            { color: 'var(--bad)', label: 'a causal inversion' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          {NODES.map((n, i) => (
            <Slider key={n} label={`${n} clock offset`} value={exec.offsets[i]} min={OFFSET_MS.min} max={OFFSET_MS.max} format={(v) => `${v >= 0 ? '+' : '-'}${Math.abs(v)} ms`} onChange={(v) => offset(i, v)} />
          ))}
        </>,
        <>
          <Segmented label="From" options={NODE_OPTIONS} value={from} onChange={setFrom} />
          <Segmented label="To" options={NODE_OPTIONS} value={to} onChange={setTo} />
          <Slider label="Sent at" value={sendAt} min={TIME_MS.min} max={TIME_MS.max} format={(v) => `${v} ms`} onChange={setSendAt} />
          <Slider label="Delay" value={delay} min={DELAY_MS.min} max={DELAY_MS.max} format={(v) => `${v} ms`} onChange={setDelay} />
          <Button onClick={() => apply(addMessage(exec, { from, to, sendAt, delay }))}>Add message</Button>
        </>,
        <>
          <Segmented label="Local event on" options={NODE_OPTIONS} value={localNode} onChange={setLocalNode} />
          <Slider label="At" value={localAt} min={TIME_MS.min} max={TIME_MS.max} format={(v) => `${v} ms`} onChange={setLocalAt} />
          <Button onClick={() => apply(addLocal(exec, { node: localNode, at: localAt }))}>Add local event</Button>
          <Button onClick={() => { setExec(CHAIN); setRefusal(null); }}>Load the chain</Button>
          <Button onClick={() => { setExec({ ...EMPTY, offsets: exec.offsets }); setRefusal(null); }}>Clear</Button>
        </>,
      ]}
    >
      <div className="hl-stage stage-pad">
        {refusal && <Hint tone="bad" block>{refusal}</Hint>}
        <WideRegion minWidth={TIMELINE_W} noun="timeline">
          <Timeline exec={exec} stamps={stamps} inverted={inverted} />
        </WideRegion>
        <div className="hl-items">
          {exec.messages.map((m, i) => (
            <ChipButton key={`m${i}-${m.from}${m.to}${m.sendAt}`} tone="info" ariaLabel={`Remove the message from ${NODES[m.from]} to ${NODES[m.to]} sent at ${m.sendAt} ms`} onClick={(e) => { refocusAfterRemove(e.currentTarget, { group: '.hl-items' }); setExec({ ...exec, messages: exec.messages.filter((_, k) => k !== i) }); }}>
              {NODES[m.from]} to {NODES[m.to]} at {m.sendAt} ms, +{m.delay} ms ×
            </ChipButton>
          ))}
          {exec.locals.map((l, i) => (
            <ChipButton key={`l${i}-${l.node}${l.at}`} tone="muted" ariaLabel={`Remove the local event on ${NODES[l.node]} at ${l.at} ms`} onClick={(e) => { refocusAfterRemove(e.currentTarget, { group: '.hl-items' }); setExec({ ...exec, locals: exec.locals.filter((_, k) => k !== i) }); }}>
              {NODES[l.node]} local at {l.at} ms ×
            </ChipButton>
          ))}
          {eventCount(exec) === 0 && <Hint>Nothing yet: add a message or a local event.</Hint>}
          <Hint>{exec.messages.length} of {MAX_MESSAGES} messages, {eventCount(exec)} of {MAX_EVENTS} events</Hint>
        </div>
        <Box>
          <SectionTitle hint="in true-time order; the rule that fired is named">Every event, three stamps</SectionTitle>
          <WideRegion minWidth={EVENT_TABLE_W} noun="table">
            <table className="data-table hl-table">
              <thead><tr><th>event</th><th>true t</th><th>physical</th><th>Lamport</th><th>hybrid (l, c)</th><th>rule that fired</th></tr></thead>
              <tbody>
                {stamps.map((s, i) => (
                  <tr key={s.event.id} className={inverted.has(i) ? 'is-inverted' : ''}>
                    <td>{labels[i]}</td><td>{s.event.t}</td><td className="hl-physical">{s.pt}</td><td className="hl-lamport">{s.lamport}</td>
                    <td className="hl-hybrid">{hlcText(s.hlc)}</td><td className="hl-rule">{RULE_TEXT[s.rule]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </WideRegion>
        </Box>
        <Box>
          <SectionTitle hint="the events sorted by each stamp">Sorted three ways</SectionTitle>
          {(['physical', 'lamport', 'hlc'] as const).map((s) => (
            <div key={s} className="hl-line"><b>{SCHEME_LABEL[s]}:</b> {order[s].join(' ')} {counts[s].length > 0 ? <span className="chip tone-bad">{counts[s].length} inversion{counts[s].length === 1 ? '' : 's'}</span> : null}</div>
          ))}
          <Hint block>An inversion is a pair where the cause carries the larger stamp, judged against happens-before computed from process order and messages alone, independent of every clock.</Hint>
        </Box>
        <ProvenanceRow>
          <Provenance kind="illustrative">clock offsets, delays and times are made up</Provenance>
          <Provenance kind="from-memory">hybrid logical clocks are from a 2014 paper by Kulkarni and colleagues; check the authors, year and exact receive rule</Provenance>
          <ClaimLabel kind="standard">the stamp is a (wall, counter) pair compared lexicographically</ClaimLabel>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}
