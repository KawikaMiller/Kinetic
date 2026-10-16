import { useMemo, useState, type ReactNode } from 'react';
import { Box, SectionTitle } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { Button, Provenance, ProvenanceRow, Stat, Stats, Toggle } from '../../components/ui';
import { pctText, sig } from '../../core/format';
import { READ_SHARE, SHARDS, UTILISATION, summarise } from './skew';
import { BURST_KEYS, BURST_M, burstView, initialBurst } from './init';
import { SHARD_LEGEND, ShardBars } from './ShardBars';

export function BurstScene({ picker }: { picker: ReactNode }) {
  const [s, setS] = useState(initialBurst);
  const v = useMemo(() => burstView(s), [s]);
  const first = summarise(v.first, UTILISATION.default);
  const second = summarise(v.second, UTILISATION.default);

  return (
    <StageFrame
      height={460}
      intro={
        <>
          The {BURST_KEYS} hottest keys are salted with {BURST_M} suffixes. {s.burst ? <>Halfway through, a celebrity event moves the hot keys{s.adaptive ? ' and the salting follows them' : ' and the salting stays where it was'}: the busiest shard is at {sig(first.maxOverMean)} times the plain mean before and {sig(second.maxOverMean)} after.</> : <>The hot keys stay put, so both halves look alike: {sig(first.maxOverMean)} and {sig(second.maxOverMean)} times the plain mean.</>}
        </>
      }
      introKey={[s.burst, s.adaptive]}
      stats={
        <Stats>
          <Stat label="First half, hottest / plain mean" value={sig(first.maxOverMean)} color={first.hottestLoad > 1 ? 'var(--bad)' : 'var(--ok)'} sub="the salting was made for these keys" />
          <Stat label="Second half, hottest / plain mean" value={sig(second.maxOverMean)} color={second.hottestLoad > 1 ? 'var(--bad)' : 'var(--ok)'} sub={s.burst ? (s.adaptive ? 'the salting followed the hot keys' : 'yesterday\'s salting, today\'s hot keys') : 'the hot keys did not move'} />
          <Stat label="Shards" value={SHARDS} sub="mod placement" />
        </Stats>
      }
      legend={SHARD_LEGEND}
      controls={
        <>
          {picker}
          <Toggle label="Hot keys" value={s.burst} onChange={(burst) => setS((x) => ({ ...x, burst }))} off="Stay put" on="Move halfway (a celebrity event)" />
          {s.burst && <Toggle label="Salting" value={s.adaptive} onChange={(adaptive) => setS((x) => ({ ...x, adaptive }))} off="Fixed at the start" on="Follows the hot keys" />}
          <Button onClick={() => setS(initialBurst())}>Reset</Button>
        </>
      }
    >
      <div className="hk-stage stage-pad hk-two">
        <Box>
          <SectionTitle hint="the first 10,000 requests">First half</SectionTitle>
          <ShardBars sets={[{ name: 'first half', loads: v.first.loads, requests: v.first.requests }]} util={UTILISATION.default} caption="Shard load in the first half" />
        </Box>
        <Box>
          <SectionTitle hint="the last 10,000 requests">Second half</SectionTitle>
          <ShardBars sets={[{ name: 'second half', loads: v.second.loads, requests: v.second.requests }]} util={UTILISATION.default} caption="Shard load in the second half" />
        </Box>
        <ProvenanceRow>
          <Provenance kind="simulated">a seeded stream of 20,000 requests whose popularity ranking rotates by 137 keys halfway through when the toggle is on</Provenance>
          <Provenance kind="illustrative">Zipf is a model of popularity, real skew varies; total utilisation is {pctText(UTILISATION.default, 0)} in both halves, with {pctText(READ_SHARE.default, 0)} reads and sub-keys on consecutive shards</Provenance>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}
