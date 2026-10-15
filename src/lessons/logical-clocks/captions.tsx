import type { ReactNode } from 'react';
import { ruleText, vectorText } from './clocks';
import { PROCESSES, RELATION_TEXT, type ExecView, type PairView } from './execution';
import type { Frame, RegMode } from './register';

const MODE_NAME: Record<RegMode, string> = { lww: 'Lamport last-write-wins', siblings: 'version-vector siblings', 'no-prune': 'siblings that are never pruned' };
export { MODE_NAME };

/** Scene 1: the rule for the selected event, or a count of what is concurrent in the drawing. */
export function drawCaption(v: ExecView, selected: number | null, messages: number): ReactNode {
  if (v.stamps.length === 0) return <>Press a slot on a process lane to add an event, then switch to Message to join two events.</>;
  if (selected === null) {
    const concurrent = v.stamps.flatMap((_, a) => v.stamps.map((__, b) => (a < b && !v.hb[a][b] && !v.hb[b][a] ? 1 : 0))).reduce<number>((s, n) => s + n, 0);
    return (
      <>
        {v.stamps.length} events and {messages} messages: {concurrent} of the {(v.stamps.length * (v.stamps.length - 1)) / 2} pairs are concurrent. Select an event to see the rule that stamped it.
      </>
    );
  }
  const s = v.stamps[selected];
  const rule = ruleText(s, PROCESSES[s.lane]);
  return (
    <>
      Event <span className="hl">{v.name(selected)}</span> on {PROCESSES[s.lane]} is {rule.kind}. Lamport: {rule.lamport}. Vector: {rule.vector}.
    </>
  );
}

/** Scene 2: the three verdicts about two events. */
export function compareCaption(v: ExecView, a: number | null, b: number | null, p: PairView | null): ReactNode {
  if (a === null || b === null || p === null) return <>Select two events: the first press picks a, the second picks b.</>;
  const [na, nb] = [v.name(a), v.name(b)];
  const [sa, sb] = [v.stamps[a], v.stamps[b]];
  return (
    <>
      Truth: <span className={`hl ${p.truth === 'concurrent' ? 'orange' : 'ok'}`}>{RELATION_TEXT[p.truth](na, nb)}</span>. Lamport {sa.lamport} against {sb.lamport}{sa.lamport === sb.lamport ? ' (equal stamps, ties broken by process number)' : ''} orders{' '}
      {p.lamport === 'before' ? `${na} before ${nb}` : `${nb} before ${na}`}
      {p.lamportMisleads ? <>, <span className="hl bad">which the events do not have</span></> : null}. Vectors {vectorText(sa.vector)} and {vectorText(sb.vector)} say{' '}
      <span className={`hl ${p.vectorWrong ? 'bad' : 'ok'}`}>{RELATION_TEXT[p.vector](na, nb)}</span>.
    </>
  );
}

/** Scene 3: where the replicas stand at one moment of a run. */
export function registerCaption(a: { mode: RegMode; seed: number; frame: Frame; widest: number }): ReactNode {
  const { frame } = a;
  return (
    <>
      <b>{MODE_NAME[a.mode]}</b>, seed {a.seed}, at {frame.t.toFixed(0)} ms: {frame.violation ? <span className="hl bad wrap">{frame.violation}.</span> : <span className="hl ok">no invariant is broken so far.</span>}{' '}
      {a.mode === 'lww' ? null : <>The widest vector so far has {a.widest} {a.widest === 1 ? 'entry' : 'entries'}, one per replica that coordinated a write. </>}
      {frame.lost.length > 0 ? <>Silently lost so far: {frame.lost.map((l) => `${l.replica} lost write ${l.write}`).join(', ')}.</> : null}
    </>
  );
}

