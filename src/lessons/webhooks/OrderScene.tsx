import { useMemo, useState, type ReactNode } from 'react';
import { SectionTitle } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { ChipButton, ControlGroup, Hint, Legend, Segmented, Toggle } from '../../components/ui';
import { usePlayer } from '../../core/usePlayer';
import { orderFrames, type OrderFrame } from './frames';
import { ORDERINGS, TRUTH, orderLabel, permutations, receive, withDuplicates, type Action, type Ordering } from './model';

const STEP_MS = 1500;
const HONEST = 'Simulated provider and receiver. Each delivery is an event the provider sends at least once; here the order and the repeats are scripted so the effects are easy to follow.';
const PERMS = permutations();
/** Starts on the late-refund order with repeats and no dedupe: the case that goes wrong in both ways. */
const DEFAULT_ORDER = PERMS.findIndex((p) => orderLabel(p) === 'refunded → created → succeeded');

const RESULT: Record<Action, string> = { applied: 'applied', 'dropped-duplicate': 'dropped (seen)', 'ignored-stale': 'ignored (older)', 'no-change': 'no change' };
const RESULT_CLASS: Record<Action, string> = { applied: 'is-applied', 'dropped-duplicate': 'is-dropped', 'ignored-stale': 'is-dropped', 'no-change': 'is-dropped' };
const clock = (created: number) => `09:${String(created).padStart(2, '0')}`;

export function OrderScene({ picker }: { picker: ReactNode }) {
  const [orderIdx, setOrderIdx] = useState(DEFAULT_ORDER);
  const [dup, setDup] = useState(true);
  const [dedupe, setDedupe] = useState(false);
  const [ordering, setOrdering] = useState<Ordering>('arrival');
  const stream = useMemo(() => (dup ? withDuplicates(PERMS[orderIdx]) : PERMS[orderIdx]), [orderIdx, dup]);
  const steps = useMemo(() => receive(stream, { dedupe, ordering }), [stream, dedupe, ordering]);
  const intro = useMemo(
    () => <>One payment produces three events: created, succeeded, refunded. They arrive as {orderLabel(PERMS[orderIdx])}{dup ? ', and the provider repeats two of them' : ''}. The receiver {dedupe ? 'dedupes by event id' : "doesn't dedupe"} and
      handles order by: {ORDERINGS.find((o) => o.id === ordering)!.label.toLowerCase()}. Press play.</>,
    [orderIdx, dup, dedupe, ordering],
  );
  const frames = useMemo(() => orderFrames(steps, { ordering, dedupe }, intro), [steps, ordering, dedupe, intro]);
  const player = usePlayer<OrderFrame>(frames, { interval: STEP_MS, autoplayOnChange: false });
  const at = player.frame.at;
  const shown = steps.slice(0, Math.max(0, Math.min(at + 1, steps.length)));
  const cur = at >= 0 && at < steps.length ? steps[at] : null;
  const last = shown[shown.length - 1];
  const done = at >= steps.length;

  return (
    <StageFrame
      player={player}
      height={520}
      legend={<Legend items={[
        { color: 'var(--info)', label: 'delivery' }, { color: 'var(--hi)', label: 'current' }, { color: 'var(--violet)', label: 'out of order' },
        { color: 'var(--dim)', label: 'dropped by dedup' }, { color: 'var(--ok)', label: 'ends at the truth' }, { color: 'var(--bad)', label: 'wrong status / repeated effect' },
      ]} />}
      controls={[
        <>{picker}</>,
        <ControlGroup key="o" label="Arrival order" inline>
          {PERMS.map((p, i) => <ChipButton key={i} tone="violet" on={orderIdx === i} onClick={() => setOrderIdx(i)}>{orderLabel(p)}</ChipButton>)}
        </ControlGroup>,
        <>
          <Toggle label="Provider retries" value={dup} onChange={setDup} off="No repeats" on="Repeat two events" />
          <Toggle label="Dedupe by event id" value={dedupe} onChange={setDedupe} off="Off" on="On" />
          <Segmented label="Handle order by" value={ordering} onChange={setOrdering} options={ORDERINGS.map((o) => ({ value: o.id, label: o.label }))} />
        </>,
      ]}
    >
      <div className="stage-pad wh">
        <div className="wh-cols">
          <div className="wh-col wh-wide">
            <SectionTitle weight="regular" hint={`${shown.length} of ${steps.length} deliveries`}>Deliveries</SectionTitle>
            <table className="data-table">
              <thead><tr><th>#</th><th>event</th><th>happened</th><th>receiver</th></tr></thead>
              <tbody>
                {steps.map((s, i) => (
                  <tr key={i} className={`${i === at ? 'is-current' : ''} ${i > at ? 'is-later' : RESULT_CLASS[s.action]}`}>
                    <td>{i + 1}</td>
                    <td>{s.event.id} <span className="wh-type">{s.event.type.replace('payment.', '')}</span>{s.duplicate ? <span className="wh-flag is-again">again</span> : null}{s.outOfOrder ? <span className="wh-flag is-late">out of order</span> : null}</td>
                    <td>{clock(s.event.created)}</td>
                    <td>{i > at ? '' : RESULT[s.action]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="wh-col">
            <SectionTitle weight="regular" hint={`provider's truth: ${TRUTH}`}>Receiver's state</SectionTitle>
            <p className="wh-state">payment status: <b className={done ? (last?.state === TRUTH ? 'is-ok' : 'is-bad') : ''}>{last?.state ?? '–'}</b></p>
            <p className="wh-note">Seen ids: {last ? last.seen.join(', ') : 'none yet'}</p>
            <p className="wh-note">Effects run: {last && last.effects.length ? last.effects.map((e, i) => <span key={i} className={last.effects.indexOf(e) < i ? 'wh-repeat' : ''}>{i ? ', ' : ''}{e}</span>) : 'none yet'}</p>
            {cur?.outOfOrder && <p className="wh-note wh-late">This one happened before an event that already arrived.</p>}
          </div>
        </div>
        <Hint block>
          {HONEST} Delivery is at least once and unordered, so a webhook consumer must be idempotent (<code>idempotency-keys</code> does the same job for requests): dedupe by event id, and
          either apply an event only if it is newer than the last one, or treat the payload as a hint and fetch the current state. Keeping the seen-ids table forever isn't free, so real systems expire it.
        </Hint>
      </div>
    </StageFrame>
  );
}
