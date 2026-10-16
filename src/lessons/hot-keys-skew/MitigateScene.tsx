import { useMemo, useState, type ReactNode } from 'react';
import { Box, SectionTitle } from '../../components/Panel';
import { SeedField } from '../../components/SeedField';
import { StageFrame } from '../../components/StageFrame';
import { Button, Hint, Legend, Provenance, ProvenanceRow, Segmented, Slider, Stat, Stats } from '../../components/ui';
import { pctText, sig } from '../../core/format';
import { HIT, MITIGATIONS, MITIGATION_LABEL, READ_SHARE, SPLIT_M, UTILISATION } from './skew';
import { MITIGATED_KEYS, initialMitigate, mitigateView } from './init';
import { SHARD_LEGEND, ShardBars } from './ShardBars';
import { totalOf } from './shardMath';

const KIND_OPTIONS = MITIGATIONS.map((k) => ({ value: k, label: MITIGATION_LABEL[k] }));

export function MitigateScene({ picker }: { picker: ReactNode }) {
  const [s, setS] = useState(initialMitigate);
  const v = useMemo(() => mitigateView(s), [s]);
  const reads = Math.round(s.readShare * 100);
  const gathered = s.kind === 'salt';

  return (
    <StageFrame
      height={460}
      intro={
        <>
          {MITIGATION_LABEL[s.kind]} on the {MITIGATED_KEYS} hottest keys, with {reads}% reads: the busiest shard goes from {sig(v.withoutSummary.maxOverMean)} to {sig(v.nowSummary.maxOverMean)} times the mean, and the first shard saturates at {pctText(v.nowSummary.saturatesAt, 0)} total utilisation instead of {pctText(v.withoutSummary.saturatesAt, 0)}.
        </>
      }
      introKey={[s.kind, s.m, s.hit, s.readShare, s.util, s.seed]}
      stats={
        <Stats>
          <Stat label="Hottest shard / mean" value={sig(v.nowSummary.maxOverMean)} color={v.nowSummary.maxOverMean < v.withoutSummary.maxOverMean ? 'var(--ok)' : 'var(--bad)'} sub={`${sig(v.withoutSummary.maxOverMean)} with no mitigation`} />
          <Stat label="First shard saturates at" value={pctText(v.nowSummary.saturatesAt, 0)} sub={`${pctText(v.withoutSummary.saturatesAt, 0)} with no mitigation`} />
          <Stat label="Requests absorbed by the cache" value={v.now.absorbed} color={v.now.absorbed > 0 ? 'var(--info)' : undefined} sub="reads that never reached a shard" />
          <Stat label="Extra shard requests" value={v.now.extra} color={v.now.extra > 0 ? 'var(--violet)' : undefined} sub={gathered ? `each read of a salted key asks all ${s.m} shards` : s.kind === 'replicate' ? `each write updates all ${s.m} replicas` : 'none for this mitigation'} />
          <Stat label="Shard requests in all" value={sig(totalOf(v.now))} sub={`${sig(v.now.requests)} requests - ${sig(v.now.absorbed)} cached + ${sig(v.now.extra)} extra`} />
        </Stats>
      }
      legend={<div><Legend items={[{ color: 'var(--violet)', label: 'extra work a mitigation adds (a gather, a replica write)' }]} />{SHARD_LEGEND}</div>}
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
        </Box>
        <ProvenanceRow>
          <Provenance kind="simulated" seed={s.seed}>a seeded request stream of 20,000, with each mitigation changing where a request lands</Provenance>
          <Provenance kind="illustrative">Zipf is a model of popularity, real skew varies; 8 shards, mod placement; the mitigated keys are the 4 hottest</Provenance>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}
