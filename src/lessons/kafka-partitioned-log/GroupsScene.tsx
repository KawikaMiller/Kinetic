import { useState, type ReactNode } from 'react';
import { Bar } from '../../components/Bar';
import { LogStream } from '../../components/LogStream';
import { Box, SectionTitle } from '../../components/Panel';
import { SeedField } from '../../components/SeedField';
import { StageFrame } from '../../components/StageFrame';
import { Button, Hint, Legend, Provenance, ProvenanceRow, Slider, Stat, Stats, Toggle } from '../../components/ui';
import { useIntroCaption } from '../../core/caption';
import { useInterval } from '../../core/useInterval';
import { groupsCaption, policyLine } from './captions';
import {
  DEFAULT_CONSUMERS, DEFAULT_GROUP_PARTITIONS, DEFAULT_GROUP_SEED, MAX_CONSUMERS, MIN_CONSUMERS, PAUSE_TICKS, TICK_CAP, advance, atRisk, crashAtWorstMoment, crashConsumer, ledger, newWorld,
  setConsumers, taskLabel, totalLag, STEPS_PER_RECORD, type CommitPolicy, type Consumer, type Group, type World,
} from './groups';
import { MAX_PARTITIONS, MIN_PARTITIONS } from './partitioning';

const TICK_MS = 450;
/** The longest "crash at the worst moment" will wait for a consumer to reach the risky window. */
const WORST_MOMENT_WAIT = 4 * STEPS_PER_RECORD * MAX_CONSUMERS;

function ConsumerCard({ c, group }: { c: Consumer; group: Group }) {
  const idle = c.partitions.length === 0;
  const risky = atRisk(group.policy, c.task);
  return (
    <div className={`kp-consumer ${idle ? 'is-idle' : ''} ${risky ? 'is-risk' : ''} ${c.leaving ? 'is-leaving' : ''}`}>
      <b>{c.id}</b>
      <span className="kp-owns">{idle ? 'no partition' : c.partitions.map((p) => `P${p}`).join(', ')}</span>
      <span className="kp-doing">{taskLabel(group.policy, c, group.pause > 0)}</span>
    </div>
  );
}

function LagRow({ p, world, a, b }: { p: number; world: World; a: Group; b: Group }) {
  const max = Math.max(1, ...world.logEnd);
  const bar = (g: Group, name: string) => (
    <Bar
      segments={[{ value: g.committed[p], tone: 'ok' }, { value: world.logEnd[p] - g.committed[p], tone: 'violet' }]}
      max={max}
      markers={[{ at: g.position[p], tone: 'info' }]}
      height={10}
      animate={false}
      ariaLabel={`Group ${name}, partition ${p}: log end ${world.logEnd[p]}, committed ${g.committed[p]}, position ${g.position[p]}, lag ${world.logEnd[p] - g.committed[p]}`}
    />
  );
  return (
    <div className="kp-lagrow">
      <b className="kp-lagname">P{p}</b>
      <div className="kp-lagbars">
        {bar(a, 'A')}
        {bar(b, 'B')}
      </div>
      <span className="kp-lagnums">
        end {world.logEnd[p]}, A at {a.committed[p]} (lag {world.logEnd[p] - a.committed[p]}), B at {b.committed[p]} (lag {world.logEnd[p] - b.committed[p]})
      </span>
    </div>
  );
}

export function GroupsScene({ picker }: { picker: ReactNode }) {
  const [p, setP] = useState(DEFAULT_GROUP_PARTITIONS);
  const [policy, setPolicy] = useState<CommitPolicy>('after');
  const [seed, setSeed] = useState(DEFAULT_GROUP_SEED);
  const [world, setWorld] = useState(() => newWorld({ p: DEFAULT_GROUP_PARTITIONS, consumers: DEFAULT_CONSUMERS, policy: 'after', seed: DEFAULT_GROUP_SEED }));
  const [running, setRunning] = useState(false);
  const [note, setNote] = useState('');

  const a = world.groups[0];
  const b = world.groups[1];
  const staying = a.consumers.filter((c) => !c.leaving).length;
  const target = a.consumers.find((c) => c.partitions.length > 0 && !c.leaving);
  const atCap = world.tick >= TICK_CAP;
  const led = ledger(a);

  useIntroCaption(groupsCaption(world), [world]);
  useInterval(() => setWorld(advance), TICK_MS, running && !atCap);

  const restart = (next: Partial<{ p: number; policy: CommitPolicy; seed: number }>) => {
    const o = { p, policy, seed, ...next };
    setP(o.p);
    setPolicy(o.policy);
    setSeed(o.seed);
    setWorld(newWorld({ ...o, consumers: staying }));
    setRunning(false);
    setNote('');
  };
  const crashNow = () => {
    if (!target) return;
    setWorld(crashConsumer(world, target.id));
    setNote('');
  };
  const crashWorst = () => {
    if (!target) return;
    const crashed = crashAtWorstMoment(world, target.id, Math.min(WORST_MOMENT_WAIT, TICK_CAP - world.tick));
    if (crashed) {
      setWorld(crashed);
      setNote('');
    } else setNote(`${target.id} never reached the risky window before the tick limit: it had no record to work on.`);
  };

  return (
    <StageFrame
      height={500}
      stats={
        <Stats>
          <Stat label="Group A lag" value={totalLag(a, world.logEnd)} color="var(--violet)" sub={`records not yet committed; group B: ${totalLag(b, world.logEnd)}`} />
          <Stat label="Processed" value={led.effects} sub={`${led.distinct} different records`} />
          <Stat label="Processed twice" value={led.duplicates} color={led.duplicates > 0 ? 'var(--bad)' : undefined} sub="extra runs of a record" />
          <Stat label="Skipped" value={led.skipped} color={led.skipped > 0 ? 'var(--bad)' : undefined} sub="committed, never processed" />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--ok)', label: 'committed offset', shape: 'line' },
            { color: 'var(--info)', label: 'a consumer\'s position (tick on the bar)', shape: 'line' },
            { color: 'var(--violet)', label: 'lag: log end minus committed', shape: 'line' },
            { color: 'var(--dim)', label: 'an idle consumer', shape: 'square' },
            { color: 'var(--hi)', label: 'the risky window, and the rebalance pause', shape: 'square' },
            { color: 'var(--bad)', label: 'a record repeated or skipped', shape: 'square' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <Toggle label="Commit" value={policy === 'before'} onChange={(before) => restart({ policy: before ? 'before' : 'after' })} off="after processing" on="before processing" />
          <Hint>{policyLine(policy)}</Hint>
        </>,
        <>
          <Slider label="Partitions" value={p} min={MIN_PARTITIONS} max={MAX_PARTITIONS} onChange={(next) => restart({ p: next })} />
          <Slider label="Consumers in group A" value={staying} min={MIN_CONSUMERS} max={MAX_CONSUMERS} onChange={(n) => setWorld(setConsumers(world, n))} />
          <SeedField seed={seed} onSeed={(next) => restart({ seed: next })} />
        </>,
        <>
          <Button onClick={() => setWorld(advance)} softDisabled={atCap}>Step one tick</Button>
          <Button onClick={() => setRunning((r) => !r)}>{running ? '❚❚ Pause' : '▶ Run'}</Button>
          <Button onClick={() => restart({})}>Reset</Button>
          <Button onClick={crashNow} softDisabled={!target}>{target ? `Crash ${target.id} now` : 'Crash a consumer'}</Button>
          <Button onClick={crashWorst} softDisabled={!target}>{target ? `Crash ${target.id} at the worst moment` : 'Crash at the worst moment'}</Button>
        </>,
      ]}
    >
      <div className="kp-stage stage-pad">
        <div className="kp-groups">
          <Box>
            <SectionTitle hint={`${staying} ${staying === 1 ? 'consumer' : 'consumers'}`}>Group A</SectionTitle>
            <div className="kp-consumers">
              {a.consumers.map((c) => <ConsumerCard key={c.id} c={c} group={a} />)}
            </div>
          </Box>
          <Box>
            <SectionTitle hint="its own offsets, the same log">Group B</SectionTitle>
            <div className="kp-consumers">
              {b.consumers.map((c) => <ConsumerCard key={c.id} c={c} group={b} />)}
            </div>
          </Box>
        </div>
        <Box>
          <SectionTitle hint="each partition: group A on top, group B below">Offsets and lag</SectionTitle>
          {Array.from({ length: p }, (_, i) => <LagRow key={i} p={i} world={world} a={a} b={b} />)}
          <Bar
            value={a.pause}
            max={PAUSE_TICKS}
            tone="hi"
            height={8}
            animate={false}
            label={<span className="kp-pauselabel">Rebalance pause, group A: {a.pause} of {PAUSE_TICKS} ticks left</span>}
            ariaLabel={`Rebalance pause: ${a.pause} of ${PAUSE_TICKS} ticks left`}
          />
        </Box>
        <Box>
          <SectionTitle hint="newest at the bottom">Group events</SectionTitle>
          <LogStream
            label="Consumer group events"
            maxHeight={140}
            follow
            max={60}
            empty="Nothing yet. Step a tick, or change the number of consumers."
            rows={world.events.map((e) => ({ id: e.id, at: `t${e.tick}`, source: `group ${e.group}`, sourceTone: e.group === 'A' ? 'info' : 'violet', tone: e.tone, text: e.text }))}
          />
        </Box>
        {note && <p className="kp-status" role="status">{note}</p>}
        <ProvenanceRow>
          <Provenance kind="simulated" seed={seed}>one record a tick from a seeded key stream; ticks, not milliseconds</Provenance>
          <Provenance kind="illustrative">the {PAUSE_TICKS}-tick rebalance pause is a made-up number; real pauses depend on the protocol and its settings</Provenance>
          <Provenance kind="from-memory">newer clients can rebalance cooperatively, moving only some partitions (check the Kafka docs); assignment here is round-robin by partition index, and the range assignor is another</Provenance>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}
