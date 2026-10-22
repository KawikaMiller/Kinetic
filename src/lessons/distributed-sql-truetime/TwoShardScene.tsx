import { useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { Box, SectionTitle } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { Button, ChipButton, ClaimLabel, Hint, Legend, Provenance, ProvenanceRow, Slider, Stat, Stats } from '../../components/ui';
import { twoShardCaption } from './captions';
import { PRESET_TWO_SHARD, twoShardCommit, type TwoShard } from './truetime';

const CLOCK_MS = { min: 90, max: 130 } as const;
const EPSILON_RANGE = { min: 1, max: 10 } as const;
const REPLICAS = 3;

function Group({ name, tone }: { name: string; tone: string }) {
  return (
    <Box className="tt-group" style={{ '--c': tone } as CSSProperties}>
      <SectionTitle hint="shown, not run">{name}</SectionTitle>
      <div className="tt-replicas">
        {Array.from({ length: REPLICAS }, (_, i) => <span key={i} className={`tt-replica ${i === 0 ? 'is-leader' : ''}`} aria-label={i === 0 ? 'leader replica' : 'follower replica'}>{i === 0 ? 'L' : 'F'}</span>)}
      </div>
    </Box>
  );
}

export function TwoShardScene({ picker }: { picker: ReactNode }) {
  const [t, setT] = useState<TwoShard>(PRESET_TWO_SHARD);
  const result = useMemo(() => twoShardCommit(t), [t]);

  return (
    <StageFrame
      height={420}
      intro={twoShardCaption({ result, epsilon: t.epsilon })}
      introKey={JSON.stringify(t)}
      stats={
        <Stats>
          <Stat label="Prepare timestamps" value={`${result.prepares[0]} and ${result.prepares[1]}`} sub="each participant's TT.now().latest" />
          <Stat label="Commit timestamp" value={result.commitTimestamp} color="var(--hi)" sub={`the maximum, coordinator's own latest ${result.coordinatorLatest} included`} />
          <Stat label="Commit wait" value={`${result.waitMs} ms`} color="var(--violet)" sub="until TT.now().earliest passes it" />
        </Stats>
      }
      legend={<Legend items={[{ color: 'var(--amber)', label: 'shard 1' }, { color: 'var(--sky)', label: 'shard 2' }, { color: 'var(--hi)', label: 'the commit timestamp' }, { color: 'var(--violet)', label: 'the commit wait' }, { color: 'var(--dim)', label: 'replication: shown, not run' }]} />}
      controls={[
        <>
          {picker}
          <ChipButton tone="violet" on={JSON.stringify(t) === JSON.stringify(PRESET_TWO_SHARD)} onClick={() => setT(PRESET_TWO_SHARD)}>Prepare at 107 and 110</ChipButton>
          <Slider label="Bound ε" value={t.epsilon} min={EPSILON_RANGE.min} max={EPSILON_RANGE.max} format={(v) => `${v} ms`} onChange={(epsilon) => setT({ ...t, epsilon })} />
        </>,
        <>
          <Slider label="Shard 1 clock" value={t.clocks[0]} min={CLOCK_MS.min} max={CLOCK_MS.max} onChange={(v) => setT({ ...t, clocks: [v, t.clocks[1]] })} />
          <Slider label="Shard 2 clock" value={t.clocks[1]} min={CLOCK_MS.min} max={CLOCK_MS.max} onChange={(v) => setT({ ...t, clocks: [t.clocks[0], v] })} />
          <Slider label="Coordinator clock" value={t.coordinatorClock} min={CLOCK_MS.min} max={CLOCK_MS.max} onChange={(v) => setT({ ...t, coordinatorClock: v })} />
          <Button onClick={() => setT(PRESET_TWO_SHARD)}>Reset</Button>
        </>,
      ]}
    >
      <div className="tt-stage stage-pad">
        <div className="tt-pair">
          <Group name="Shard 1: a group of three replicas" tone="var(--amber)" />
          <Group name="Shard 2: a group of three replicas" tone="var(--sky)" />
        </div>
        <Box>
          <SectionTitle hint="two-phase commit, timestamps only">How the commit timestamp is chosen</SectionTitle>
          <table className="data-table">
            <thead><tr><th>who</th><th>clock</th><th>timestamp (clock + ε)</th></tr></thead>
            <tbody>
              <tr><td>shard 1 prepares</td><td>{t.clocks[0]}</td><td>{result.prepares[0]}</td></tr>
              <tr><td>shard 2 prepares</td><td>{t.clocks[1]}</td><td>{result.prepares[1]}</td></tr>
              <tr><td>coordinator</td><td>{t.coordinatorClock}</td><td>{result.coordinatorLatest}</td></tr>
              <tr className="tt-picked"><td>commit timestamp</td><td /><td>{result.commitTimestamp}</td></tr>
            </tbody>
          </table>
          <Hint block>After the commit timestamp is fixed the coordinator waits until its clock minus ε is above it, {result.waitMs} ms here, and only then reports the commit: the same wait as the race scene.</Hint>
        </Box>
        <Hint block>A different design, in words: a database that uses hybrid logical clocks (the previous lesson) with a configured maximum offset can skip the commit wait and instead restarts a read whose timestamp falls inside the uncertainty of a newer write. Both descriptions are from memory.</Hint>
        <ProvenanceRow>
          <Provenance kind="not-run">each shard is a group of three replicas; the paper's groups use Paxos, and CockroachDB uses Raft, both from memory</Provenance>
          <Provenance kind="from-memory">CockroachDB uses hybrid logical clocks, Raft and uncertainty restarts; check its documentation</Provenance>
          <Provenance kind="illustrative">the clock readings are made up</Provenance>
          <ClaimLabel kind="practice">the commit timestamp is the maximum of the participants' prepare timestamps</ClaimLabel>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}
