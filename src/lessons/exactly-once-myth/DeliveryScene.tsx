import { useMemo, useState, type ReactNode } from 'react';
import { Box, SectionTitle } from '../../components/Panel';
import { SequenceDiagram } from '../../components/SequenceDiagram';
import { StageFrame } from '../../components/StageFrame';
import { Hint, Legend, Provenance, ProvenanceRow, Segmented, Slider, Stat, Stats, Toggle } from '../../components/ui';
import { useIntroCaption } from '../../core/caption';
import { toSequence } from '../../core/distSim';
import { deliveryCaption } from './captions';
import {
  BROKER, CONSUMER, DEFAULT_LOSS, DELIVERY_BROKEN_SEED, DELIVERY_MODES, HORIZON_MS, MESSAGES, MODE_LABEL, countersAt, deliveryCluster, linkTotals, type DeliveryMode, type DeliveryMsg,
} from './delivery';
import { SeedField } from '../../components/SeedField';

const MODE_OPTIONS = DELIVERY_MODES.map((m) => ({ value: m, label: MODE_LABEL[m] }));
const LOSS_STEP = 0.05;
const LOSS_MAX = 0.6;
const ACTORS = [{ id: 'client', label: 'producer' }, { id: BROKER, label: 'broker' }, { id: CONSUMER, label: 'consumer' }];

const label = (p: DeliveryMsg): string => (p.type === 'publish' ? `publish ${p.id}` : p.type === 'deliver' ? `deliver ${p.id}` : p.type === 'ack' ? `ack ${p.id}` : `confirm ${p.id}`);

export function DeliveryScene({ picker }: { picker: ReactNode }) {
  const [mode, setMode] = useState<DeliveryMode>('at-least-once');
  const [loss, setLoss] = useState(DEFAULT_LOSS);
  const [crash, setCrash] = useState(false);
  const [seed, setSeed] = useState(DELIVERY_BROKEN_SEED);
  const [at, setAt] = useState<number | null>(null);

  const run = useMemo(() => {
    const c = deliveryCluster({ seed, mode, loss, crash });
    c.run({ until: HORIZON_MS });
    return c;
  }, [seed, mode, loss, crash]);
  const t = at === null ? HORIZON_MS : at;
  const counters = countersAt(run, t);
  const totals = linkTotals(run, t);
  const ended = t >= HORIZON_MS;
  const sequence = useMemo(
    () => toSequence(run.trace.filter((r) => r.t <= t), { actors: ACTORS, label, events: true, times: false }),
    [run, t],
  );

  useIntroCaption(deliveryCaption({ mode, loss, seed, c: counters, messages: counters.published, at: t, ended, unsure: totals.unsure }), [mode, loss, crash, seed, t]);

  return (
    <StageFrame
      height={420}
      stats={
        <Stats>
          <Stat label="Sent" value={counters.sent} sub="deliveries from the broker, retries included" />
          <Stat label="Delivered" value={counters.delivered} color="var(--info)" sub="deliveries that reached the consumer" />
          <Stat label="Duplicates" value={counters.duplicates} color={counters.duplicates > 0 ? 'var(--orange)' : undefined} sub="extra processings of a message" />
          <Stat label={ended ? 'Lost' : 'Not processed yet'} value={counters.lost} color={ended ? (counters.lost > 0 ? 'var(--bad)' : 'var(--ok)') : undefined} sub={ended ? `of ${MESSAGES} messages never processed` : `of ${counters.published} published by ${t} ms`} />
          <Stat label="On the link" value={totals.messages} sub="deliveries, acks and confirms handed to it" />
          {mode === 'exactly-once' && <Stat label="Consumer unsure" value={totals.unsure} color={totals.unsure > 0 ? 'var(--orange)' : undefined} sub="processed, no confirm heard yet" />}
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--info)', label: 'a message that arrived', shape: 'line' },
            { color: 'var(--bad)', label: 'a lost message (✕)' },
            { color: 'var(--orange)', label: 'a duplicate processing (the count)' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <Segmented label="Delivery" value={mode} onChange={(m) => { setMode(m); setAt(null); }} options={MODE_OPTIONS} />
        </>,
        <>
          <Slider label="Link loses" value={loss} min={0} max={LOSS_MAX} step={LOSS_STEP} format={(v) => `${Math.round(v * 100)}%`} onChange={(v) => { setLoss(v); setAt(null); }} />
          <Toggle label="Consumer" value={crash} onChange={(v) => { setCrash(v); setAt(null); }} off="Stays up" on="Crashes once" />
          <SeedField seed={seed} onSeed={(s) => { setSeed(s); setAt(null); }} />
          <Slider label="Replay to" value={t} min={0} max={HORIZON_MS} step={10} format={(v) => `${v} ms`} onChange={setAt} />
        </>,
      ]}
    >
      <div className="eo-stage stage-pad">
        <Box>
          <SectionTitle hint={`${MESSAGES} messages, published 25 ms apart`}>The messages</SectionTitle>
          <SequenceDiagram actors={ACTORS} messages={sequence.messages} ariaLabel="Publishes, deliveries, acks and confirms between the producer, broker and consumer" />
        </Box>
        {mode === 'exactly-once' && (
          <Hint tone="muted">Every confirm is one more message that can be lost. The consumer that never hears one keeps asking, and the broker cannot tell whether its last answer arrived: the same standoff as the generals.</Hint>
        )}
        <ProvenanceRow>
          <Provenance kind="simulated" seed={seed}>a producer, a broker and a consumer on the distSim harness; loss and a crash, no network duplication</Provenance>
          <Provenance kind="illustrative">a toy broker; real brokers differ and no product is shown running</Provenance>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}
