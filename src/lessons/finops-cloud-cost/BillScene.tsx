import { useState, type ReactNode } from 'react';
import { Bar } from '../../components/Bar';
import { Curve, Plot2D, Points, VLine } from '../../components/Plot2D';
import { StageFrame } from '../../components/StageFrame';
import { Hint, Legend, Provenance, ProvenanceRow, Segmented, Slider, Stat, Stats } from '../../components/ui';
import { dollars } from '../../core/format';
import {
  BREAK_EVEN_READS, COLD_READ_RATIO, COLD_STORAGE_RATIO, STORED_GB, bill, peakNeed, tierPerGbMonth, type Tier, type Zones,
} from './cost';
import { LengthField } from './LengthField';
import { BILL_OPENING, WEB, billCaption } from './view';

const ZONES: { value: Zones; label: string }[] = [{ value: 2, label: '2 zones' }, { value: 3, label: '3 zones' }];
const TIERS: { value: Tier; label: string }[] = [{ value: 'standard', label: 'standard tier' }, { value: 'cold', label: 'colder tier' }];
const READ_STEPS = 100;

/** Scene 3: the storage tier break-even and the day's whole bill. */
export function BillScene({ picker }: { picker: ReactNode }) {
  const [committed, setCommitted] = useState<number>(BILL_OPENING.committed);
  const [zones, setZones] = useState<Zones>(BILL_OPENING.zones);
  const [sameZone, setSameZone] = useState<number>(BILL_OPENING.sameZone * 100);
  const [tier, setTier] = useState<Tier>(BILL_OPENING.tier);
  const [tenths, setTenths] = useState<number>(BILL_OPENING.readsTenths);

  const reads = tenths / 10;
  const b = bill(WEB, committed, zones, sameZone / 100, tier, reads);
  const peak = peakNeed(WEB);
  const standard = tierPerGbMonth('standard', 0);
  const cold = Array.from({ length: READ_STEPS + 1 }, (_, i) => [i / 10, tierPerGbMonth('cold', i / 10)] as [number, number]);
  const parts = [
    { label: 'compute', value: b.compute, tone: 'info' as const },
    { label: 'transfer between zones', value: b.transfer, tone: 'bad' as const },
    { label: `storage, ${STORED_GB.toLocaleString('en-US')} GB`, value: b.storage, tone: 'amber' as const },
  ];

  return (
    <StageFrame
      height={620}
      intro={billCaption(committed, zones, sameZone / 100, tier, reads)}
      introKey={`bill|${committed}|${zones}|${sameZone}|${tier}|${tenths}`}
      stats={
        <Stats>
          <Stat label="Illustrative cost per day" value={dollars(b.total)} sub={['compute + transfer + storage']} />
          <Stat label="Cost per million requests" value={b.perMillion === null ? 'no traffic' : dollars(b.perMillion)} sub="the web profile's 20.16 million requests" />
          <Stat label="Tier break-even" value={`${BREAK_EVEN_READS.toFixed(2)} reads`} sub="full reads per GB-month at which the tiers tie" />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--info)', label: 'compute', shape: 'square' },
            { color: 'var(--bad)', label: 'transfer between zones', shape: 'square' },
            { color: 'var(--amber)', label: 'storage', shape: 'square' },
            { color: 'var(--ok)', label: 'the break-even', shape: 'line' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <LengthField label="Committed instances" value={committed} min={0} max={peak} onValue={setCommitted} />
          <Segmented label="Zones" value={zones} onChange={setZones} options={ZONES} />
          <Slider label="Calls kept in the same zone" value={sameZone} min={0} max={100} step={5} format={(v) => `${v}%`} onChange={setSameZone} />
        </>,
        <>
          <Segmented label="Storage tier" value={tier} onChange={setTier} options={TIERS} />
          <Slider label="Full reads per GB-month" value={tenths} min={0} max={READ_STEPS} format={(v) => (v / 10).toFixed(1)} onChange={setTenths} />
        </>,
      ]}
    >
      <div className="fin-stage stage-pad">
        <div className="fin-wide">
          {parts.map((p) => (
            <div key={p.label}>
              <div className="fin-bar-label"><span>{p.label}</span><b>{dollars(p.value)}</b></div>
              <Bar value={p.value} max={Math.max(0.01, b.total)} tone={p.tone} height={12} ariaLabel={`${p.label} ${dollars(p.value)} of ${dollars(b.total)}`} />
            </div>
          ))}
        </div>
        <figure className="fin-figure">
          <figcaption>Storage price per GB-month against full reads per GB-month: the colder tier is cheaper below {BREAK_EVEN_READS.toFixed(2)} reads and dearer above</figcaption>
          <Plot2D x={{ domain: [0, 10], label: 'full reads per GB-month', ticks: 5 }} y={{ domain: [0, 0.2], label: 'price per GB-month', ticks: 4 }} width={340} height={190} ariaLabel={`Storage price against reads: the tiers tie at ${BREAK_EVEN_READS.toFixed(2)} reads`}>
            <Curve points={cold} tone="info" />
            <Curve points={[[0, standard], [10, standard]]} tone="amber" />
            <VLine at={BREAK_EVEN_READS} tone="ok" dashed label={`ties at ${BREAK_EVEN_READS.toFixed(2)}`} />
            <Points data={[{ x: reads, y: tierPerGbMonth(tier, reads), tone: 'hi' }]} r={5} />
          </Plot2D>
        </figure>
        <Hint tone="muted" className="fin-note">
          The colder tier charges {Math.round(COLD_STORAGE_RATIO * 100)}% of the standard monthly price for storage and {Math.round(COLD_READ_RATIO * 100)}% of it for each full read of a GB; request charges are ignored. Caching, right-sizing and serverless are named, not modelled: see the autoscaling and serverless-cold-starts lessons.
          This model leaves out per-second billing, support plans, free tiers, regions and discounts.
        </Hint>
        <ProvenanceRow>
          <Provenance kind="illustrative">the tier prices are ratios of one invented standard price, not copied from any provider or lesson</Provenance>
          <Provenance kind="from-memory">that colder storage tiers charge for reads is a general pattern named from memory, to verify against your provider&apos;s documentation</Provenance>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}
