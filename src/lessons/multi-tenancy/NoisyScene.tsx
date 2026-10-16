import { useMemo, useState, type ReactNode } from 'react';
import { SeedField } from '../../components/SeedField';
import { StageFrame } from '../../components/StageFrame';
import { Button, ChipButton, Hint, Legend, Provenance, ProvenanceRow, Segmented, Slider, Stats } from '../../components/ui';
import { useIntroCaption } from '../../core/caption';
import { noisyCaption, tenantName } from './captions';
import { NOISY_RATE, initialNoisy, tenantsOf, type NoisyState } from './init';
import { CALM_RATE, NO_POLICY, RATE_RANGE, SHARDS, runShards } from './shardSim';
import { RunStats, TenantBoard, TenantTable } from './TenantBoard';

const SHARD_OPTIONS = Array.from({ length: SHARDS }, (_, i) => ({ value: i, label: `shard ${i + 1}` }));

export function NoisyScene({ picker }: { picker: ReactNode }) {
  const [s, setS] = useState<NoisyState>(initialNoisy);
  const config = useMemo(() => ({ seed: s.seed, tenants: tenantsOf(s.rates), shardOf: s.shardOf, policy: NO_POLICY }), [s.seed, s.rates, s.shardOf]);
  const run = useMemo(() => runShards(config), [config]);
  const set = (patch: Partial<NoisyState>) => setS((x) => ({ ...x, ...patch }));
  const setRate = (rate: number) => setS((x) => ({ ...x, rates: x.rates.map((r, i) => (i === x.selected ? rate : r)) }));

  useIntroCaption(noisyCaption(run, s.selected), [JSON.stringify(s)]);

  return (
    <StageFrame
      height={560}
      stats={<Stats><RunStats run={run} actor={s.selected} /></Stats>}
      legend={
        <Legend
          items={[
            { color: 'var(--orange)', label: 'the tenant you are editing (the actor)' },
            { color: 'var(--bad)', label: 'a neighbour that got hurt' },
            { color: 'var(--ok)', label: 'a tenant that kept its latency' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <ChipButton tone="info" onClick={() => setRate(NOISY_RATE)}>make {tenantName(s.selected)} noisy ({NOISY_RATE}/s)</ChipButton>
          <ChipButton tone="info" onClick={() => setRate(CALM_RATE)}>back to {CALM_RATE}/s</ChipButton>
          <Button onClick={() => setS(initialNoisy())}>Reset</Button>
        </>,
        <>
          <Slider label={`${tenantName(s.selected)} sends`} value={s.rates[s.selected]} {...RATE_RANGE} format={(v) => `${v} requests/s`} onChange={setRate} />
          <Segmented
            label={`${tenantName(s.selected)} runs on`}
            value={s.shardOf[s.selected]}
            onChange={(shard) => setS((x) => ({ ...x, shardOf: x.shardOf.map((v, i) => (i === x.selected ? shard : v)) }))}
            options={SHARD_OPTIONS}
          />
          <SeedField seed={s.seed} onSeed={(seed) => set({ seed })} />
        </>,
      ]}
    >
      <div className="mt-stage stage-pad">
        <TenantBoard run={run} actor={s.selected} onSelect={(selected) => set({ selected })} />
        <TenantTable run={run} actor={s.selected} />
        <Hint tone="muted" block>
          Eight tenants share four shards, and each shard is one queue with four workers. Pick a tenant (a cell), raise its rate, and look at who else is on its shard. Move it to another shard to move the damage.
        </Hint>
        <ProvenanceRow>
          <Provenance kind="simulated" seed={s.seed}>10 seconds of requests, ticking every millisecond; each tenant draws its own arrivals from the seed</Provenance>
          <Provenance kind="illustrative">the capacity, the cost of a request and the hurt thresholds are made up; real shards are far bigger</Provenance>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}
