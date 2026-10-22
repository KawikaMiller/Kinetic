import { useState, type ReactNode } from 'react';
import { Bar } from '../../components/Bar';
import { StageFrame } from '../../components/StageFrame';
import { Hint, Legend, Provenance, ProvenanceRow, Segmented, Slider, Stat, Stats } from '../../components/ui';
import { dollars, pctText } from '../../core/format';
import { PAYLOAD_MB, P_X, dayCost, requestsPerDay, transfer, crossingShare, type Zones } from './cost';
import { BYTES_OPENING, WEB, WEB_OPTIMUM, bytesCaption } from './view';

const ZONES: { value: Zones; label: string }[] = [{ value: 2, label: '2 zones' }, { value: 3, label: '3 zones' }];

/** Scene 2: the line nobody budgets, bytes moving between zones. */
export function BytesScene({ picker }: { picker: ReactNode }) {
  const [zones, setZones] = useState<Zones>(BYTES_OPENING.zones);
  const [sameZone, setSameZone] = useState<number>(BYTES_OPENING.sameZone * 100);
  const requests = requestsPerDay(WEB);
  const t = transfer(requests, zones, sameZone / 100);
  const compute = dayCost(WEB, WEB_OPTIMUM).total;
  const scale = Math.max(t.cost, compute, 1);

  return (
    <StageFrame
      height={460}
      intro={bytesCaption(requests, zones, sameZone / 100)}
      introKey={`bytes|${zones}|${sameZone}`}
      stats={
        <Stats>
          <Stat label="Bytes crossing zones per day" value={`${Math.round(t.crossingGb).toLocaleString('en-US')} GB`} color={t.cost > compute ? 'var(--bad)' : 'var(--ok)'} sub={`${pctText(crossingShare(zones, sameZone / 100), 1)} of ${t.gb.toLocaleString('en-US')} GB`} />
          <Stat label="Illustrative transfer cost per day" value={dollars(t.cost)} color={t.cost > compute ? 'var(--bad)' : 'var(--ok)'} sub={`${dollars(P_X)} per GB between zones`} />
          <Stat label="Compute at the cheapest commitment" value={dollars(compute)} sub={`${WEB_OPTIMUM} committed instances, web profile`} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--bad)', label: 'bytes crossing a zone boundary, and the cost that follows', shape: 'square' },
            { color: 'var(--ok)', label: 'bytes staying in their zone', shape: 'square' },
            { color: 'var(--info)', label: 'compute', shape: 'square' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <Segmented label="Zones" value={zones} onChange={setZones} options={ZONES} />
          <Slider label="Calls kept in the same zone" value={sameZone} min={0} max={100} step={5} format={(v) => `${v}%`} onChange={setSameZone} />
        </>,
      ]}
    >
      <div className="fin-stage stage-pad">
        <div className="fin-wide">
          <div className="fin-bar-label"><span>Data per day</span><b>{t.gb.toLocaleString('en-US')} GB: {requests.toLocaleString('en-US')} requests x {PAYLOAD_MB} MB</b></div>
          <Bar segments={[{ value: t.gb - t.crossingGb, tone: 'ok' }, { value: t.crossingGb, tone: 'bad' }]} max={Math.max(1, t.gb)} height={14} ariaLabel={`${Math.round(t.crossingGb)} of ${t.gb} gigabytes cross a zone boundary`} />
          <div className="fin-bar-label"><span>Transfer</span><b>{dollars(t.cost)}</b></div>
          <Bar value={t.cost} max={scale} tone="bad" height={14} ariaLabel={`Transfer ${dollars(t.cost)}`} />
          <div className="fin-bar-label"><span>Compute</span><b>{dollars(compute)}</b></div>
          <Bar value={compute} max={scale} tone="info" height={14} ariaLabel={`Compute ${dollars(compute)}`} />
        </div>
        <Hint tone="muted" className="fin-note">
          With {zones} zones a call lands in another zone with probability (1 - same-zone share) x ({zones} - 1) / {zones}. Internet egress and the storage classes are the object-storage lesson&apos;s, named here and not modelled.
        </Hint>
        <ProvenanceRow>
          <Provenance kind="illustrative">the payload size, the price per GB and the web profile are round numbers for the page, not any provider&apos;s</Provenance>
          <Provenance kind="from-memory">providers bill data moving between zones: a general behaviour named from memory, to verify against your provider&apos;s pricing documentation</Provenance>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}
