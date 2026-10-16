import { useMemo, useState, type ReactNode } from 'react';
import { Box, SectionTitle } from '../../components/Panel';
import { SeedField } from '../../components/SeedField';
import { StageFrame } from '../../components/StageFrame';
import { Button, Hint, Legend, Provenance, ProvenanceRow, Segmented, Slider, Stat, Stats } from '../../components/ui';
import { integer, pctText, sig } from '../../core/format';
import { HIT, MITIGATIONS, MITIGATION_LABEL, READ_SHARE, SHARDS, SPLIT_M, UTILISATION } from './skew';
import { MITIGATED_KEYS, initialMitigate, mitigateView } from './init';
import { ShardBars } from './ShardBars';
import { SHARD_LEGEND_ITEMS, conservationText, pct, totalOf } from './shardMath';

const KIND_OPTIONS = MITIGATIONS.map((k) => ({ value: k, label: MITIGATION_LABEL[k] }));

export function MitigateScene({ picker }: { picker: ReactNode }) {
  const [s, setS] = useState(initialMitigate);
  const v = useMemo(() => mitigateView(s), [s]);
  const reads = Math.round(s.readShare * 100);
  const gathered = s.kind === 'salt';
  const legendItems = [
    ...SHARD_LEGEND_ITEMS,
    ...(gathered || s.kind === 'replicate' ? [{ color: 'var(--violet)', label: 'extra work added (a gather, a replica write): the number, not a bar' }] : []),
    ...(s.kind === 'cache' ? [{ color: 'var(--info)', label: 'reads the cache absorbed: the number, not a bar' }] : []),
  ];
  const spread = v.placement;

  return (
    <StageFrame
      height={460}
      intro={
        <>
          {MITIGATION_LABEL[s.kind]} on the {MITIGATED_KEYS} hottest keys, with {reads}% reads: the busiest shard goes from {sig(v.withoutSummary.maxOverMean)} to {sig(v.nowSummary.maxOverMean)} times the plain mean (requests / 8), and the first shard saturates at {pctText(v.nowSummary.saturatesAt, 0)} total utilisation instead of {pctText(v.withoutSummary.saturatesAt, 0)}.
        </>
      }
      introKey={[s.kind, s.m, s.hit, s.readShare, s.util, s.seed]}
      stats={
        <Stats>
          <Stat label="Hottest shard / plain mean" value={sig(v.nowSummary.maxOverMean)} color={v.nowSummary.maxOverMean < v.withoutSummary.maxOverMean ? 'var(--ok)' : 'var(--bad)'} sub={`${sig(v.withoutSummary.maxOverMean)} with no mitigation; the plain mean is requests / ${SHARDS}`} />
          <Stat label="First shard saturates at" value={pctText(v.nowSummary.saturatesAt, 0)} sub={`${pctText(v.withoutSummary.saturatesAt, 0)} with no mitigation`} />
          <Stat label="Requests absorbed by the cache" value={integer(v.now.absorbed)} color={v.now.absorbed > 0 ? 'var(--info)' : undefined} sub="reads that never reached a shard" />
          <Stat label="Extra shard requests" value={integer(v.now.extra)} color={v.now.extra > 0 ? 'var(--violet)' : undefined} sub={gathered ? `each read of a salted key asks all ${s.m} shards` : s.kind === 'replicate' ? `each write updates all ${s.m} replicas` : 'none for this mitigation'} />
          <Stat label="Shard requests in all" value={integer(totalOf(v.now))} sub={conservationText(v.now)} />
        </Stats>
      }
      legend={<Legend items={legendItems} />}
      controls={[
        <>
          {picker}
          <Segmented label="Mitigation" value={s.kind} onChange={(kind) => setS((x) => ({ ...x, kind }))} options={KIND_OPTIONS} />
        </>,
        <>
          {(s.kind === 'salt' || s.kind === 'replicate') && (
            <Slider label={s.kind === 'salt' ? 'Salt suffixes m' : 'Replicas m'} value={s.m} min={SPLIT_M.min} max={SPLIT_M.max} onChange={(m) => setS((x) => ({ ...x, m }))} />
          )}
          {s.kind === 'cache' && <Slider label="Cache hit ratio" value={s.hit} min={HIT.min} max={HIT.max} step={HIT.step} format={(h) => pctText(h, 0)} onChange={(hit) => setS((x) => ({ ...x, hit }))} />}
          <Slider label="Reads in the mix" value={s.readShare} min={READ_SHARE.min} max={READ_SHARE.max} step={READ_SHARE.step} format={(r) => pctText(r, 0)} onChange={(readShare) => setS((x) => ({ ...x, readShare }))} />
          <Slider label="Total utilisation" value={s.util} min={UTILISATION.min} max={UTILISATION.max} step={UTILISATION.step} format={(u) => pctText(u, 0)} onChange={(util) => setS((x) => ({ ...x, util }))} />
        </>,
        <>
          <SeedField seed={s.seed} onSeed={(seed) => setS((x) => ({ ...x, seed }))} label="Stream seed" />
          <Button onClick={() => setS(initialMitigate())}>Reset</Button>
          <Hint tone="muted">Coalescing duplicate in-flight requests is the idea behind a stampede defence, named here and not simulated.</Hint>
        </>,
      ]}
    >
      <div className="hk-stage stage-pad">
        <Box>
          <SectionTitle hint="the thin bar under each shard is the same stream with no mitigation">Load against capacity, now and before</SectionTitle>
          <ShardBars sets={[{ name: 'now', loads: v.now.loads, requests: v.now.requests }, { name: 'no mitigation', loads: v.without.loads, requests: v.without.requests }]} util={s.util} caption="Shard load with the mitigation, and without it" />
          <p className="hk-note">
            Salting spreads a hot key&apos;s writes and makes every read of it gather all its sub-keys; a cache takes only reads; replication spreads reads and multiplies writes. Move the read share to see which side each one helps.
          </p>
          {spread && (
            <p className="hk-note">
              The {s.m} {gathered ? 'sub-keys' : 'replicas'} here sit on consecutive shards, so they never collide: the best case. Put each on a random shard instead (what hashing a suffix amounts to) and, over {spread.draws} placements, the busiest shard is at {pctText(spread.median, 0)} of its capacity in the median one, against {pct(v.nowSummary.hottestLoad)} in this layout and {pct(v.withoutSummary.hottestLoad)} with no mitigation; it is above the no-mitigation figure in {pctText(spread.worseShare, 0)} of the placements.
            </p>
          )}
        </Box>
        <ProvenanceRow>
          <Provenance kind="simulated" seed={s.seed}>a seeded request stream of 20,000, with each mitigation changing where a request lands</Provenance>
          <Provenance kind="illustrative">Zipf is a model of popularity, real skew varies; 8 shards, mod placement; the mitigated keys are the 4 hottest; salt sub-keys and replicas sit on consecutive shards (the best case, see the note under the bars)</Provenance>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}
