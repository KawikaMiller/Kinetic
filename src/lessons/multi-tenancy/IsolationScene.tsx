import { useMemo, useState, type ReactNode } from 'react';
import { SeedField } from '../../components/SeedField';
import { StageFrame } from '../../components/StageFrame';
import { Button, Hint, Legend, Provenance, ProvenanceRow, Segmented, Stats, Toggle } from '../../components/ui';
import { useIntroCaption } from '../../core/caption';
import { noisyCaption } from './captions';
import { NOISY_MODES, SHARED_PLACEMENT, SILO_PLACEMENT, initialIsolation, isolationTenants, type IsolationState, type NoisyMode } from './init';
import { CONC_LIMIT, NOISY_CHEAP, NOISY_EXPENSIVE, RATE_LIMIT, SLOTS, runShards } from './shardSim';
import { RunStats, TenantBoard, TenantTable } from './TenantBoard';

/** Tenant 1 is the actor of this scene. */
const ACTOR = 0;

export function IsolationScene({ picker }: { picker: ReactNode }) {
  const [s, setS] = useState<IsolationState>(initialIsolation);
  const config = useMemo(
    () => ({ seed: s.seed, tenants: isolationTenants(s.mode), shardOf: s.silo ? SILO_PLACEMENT : SHARED_PLACEMENT, policy: s.policy }),
    [s.seed, s.mode, s.silo, s.policy],
  );
  const run = useMemo(() => runShards(config), [config]);
  const setPolicy = (patch: Partial<IsolationState['policy']>) => setS((x) => ({ ...x, policy: { ...x.policy, ...patch } }));

  useIntroCaption(noisyCaption(run, ACTOR), [JSON.stringify(s)]);

  return (
    <StageFrame
      height={600}
      stats={<Stats><RunStats run={run} actor={ACTOR} /></Stats>}
      legend={
        <Legend
          items={[
            { color: 'var(--orange)', label: 'Tenant 1, the noisy one' },
            { color: 'var(--bad)', label: 'a neighbour that got hurt' },
            { color: 'var(--ok)', label: 'a tenant that kept its latency' },
            { color: 'var(--hi)', label: 'a throttled request' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <Segmented label="Tenant 1" value={s.mode} onChange={(mode: NoisyMode) => setS((x) => ({ ...x, mode }))} options={NOISY_MODES} />
          <Button onClick={() => setS(initialIsolation())}>Reset</Button>
        </>,
        <>
          <Toggle label={`Rate limit (${RATE_LIMIT.rate}/s each)`} value={s.policy.rateLimit} onChange={(rateLimit) => setPolicy({ rateLimit })} />
          <Toggle label={`Bulkhead (${CONC_LIMIT} of ${SLOTS} workers each)`} value={s.policy.bulkhead} onChange={(bulkhead) => setPolicy({ bulkhead })} />
          <Toggle label="Scheduling" value={s.policy.fair} onChange={(fair) => setPolicy({ fair })} off="first come first served" on="fair queueing" />
          <Toggle label="Tenant 1's shard" value={s.silo} onChange={(silo) => setS((x) => ({ ...x, silo }))} off="shared" on="its own (siloed)" />
          <SeedField seed={s.seed} onSeed={(seed) => setS((x) => ({ ...x, seed }))} />
        </>,
      ]}
    >
      <div className="mt-stage stage-pad">
        <TenantBoard run={run} actor={ACTOR} />
        <TenantTable run={run} actor={ACTOR} />
        <Hint tone="muted" block>
          Tenant 1 asks for the same work either way: {NOISY_CHEAP.rate} cheap requests a second or {NOISY_EXPENSIVE.rate} expensive ones. A rate limit counts requests, so it stops the first and not the second. A bulkhead keeps slots free for the others. Fair queueing serves whoever has had least, but cannot interrupt a request that is already running.
        </Hint>
        <ProvenanceRow>
          <Provenance kind="simulated" seed={s.seed}>the same traffic on every setting: each tenant draws its arrivals from the seed alone</Provenance>
          <Provenance kind="illustrative">the limits, the worker counts and the cost of a request are made up</Provenance>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}
