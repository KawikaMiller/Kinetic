import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ArrayStrip, type ArrayCellState } from '../../components/ArrayStrip';
import { GanttLanes } from '../../components/GanttLanes';
import { SectionTitle } from '../../components/Panel';
import { Sparkline } from '../../components/Sparkline';
import { StageFrame } from '../../components/StageFrame';
import { Button, Hint, Legend, PauseButton, Segmented, Slider, Stat, Stats, Toggle } from '../../components/ui';
import { WideRegion } from '../../components/WideRegion';
import { useIntroCaption, useSetCaption } from '../../core/caption';
import { decimal, NA, plural } from '../../core/format';
import { createCooldown } from '../../core/sim';
import { useSimulation } from '../../core/useSimulation';
import { eventCaption, errorWords, insightCaption, introCaption } from './captions';
import {
  DEFAULT_SETTINGS, isDown, MAX_ATTEMPTS_LIMIT, OUTAGE_SCENARIO, redrive, toSeconds, type Policy, type Settings,
} from './model';
import { advance, createLive, DLQ_ROWS, LANE_CELLS, SCENARIOS, snapshot, type Live, type SceneId, type Snapshot } from './sim';

const LANE_MIN_W = 520;
const INSIGHT_COOLDOWN_S = 10;
/** How far the dependency timeline looks ahead of the outage. */
const TIMELINE_SPAN = 60;
const HONEST = 'Simulated queue and consumer, at three times real speed; rates, delays and the outage are illustrative. In an ordered partition the lane also waits during a backoff (real systems often retry from a separate queue), and Pause assumes the consumer can tell the dependency is down, say through a health check or a breaker. Retries inside one delivery are assumed to reuse the work already done, so Work repeated counts only redeliveries.';

const POLICIES: { value: Policy; label: string }[] = [
  { value: 'forever', label: 'Retry forever' },
  { value: 'max-attempts', label: 'Max attempts' },
  { value: 'drop', label: 'Drop on error' },
];

/** Settings each scene starts with. */
const START: Record<SceneId, Settings> = {
  poison: { ...DEFAULT_SETTINGS, policy: 'forever' },
  transient: { ...DEFAULT_SETTINGS, policy: 'max-attempts', maxAttempts: 3 },
  redrive: { ...DEFAULT_SETTINGS, policy: 'max-attempts', maxAttempts: 3 },
};

const LEGEND = (
  <Legend
    items={[
      { color: 'var(--info)', label: 'waiting' },
      { color: 'var(--hi)', label: 'being handled' },
      { color: 'var(--bad)', label: 'poison message' },
      { color: 'var(--orange)', label: 'retry attempt' },
      { color: 'var(--violet)', label: 'parked in DLQ' },
      { color: 'var(--ok)', label: 'processed' },
    ]}
  />
);

export function QueueScene({ scene, picker }: { scene: SceneId; picker: ReactNode }) {
  const setCaption = useSetCaption();
  const [settings, setSettings] = useState<Settings>(START[scene]);
  const told = useRef(new Set<string>());
  const insight = useRef(createCooldown(INSIGHT_COOLDOWN_S));
  const latest = useRef({ settings, scene });
  useEffect(() => {
    latest.current = { settings, scene };
  });

  const { world, snap, paused, togglePause, reset, refresh } = useSimulation<Live, Snapshot>({
    create: () => {
      const live = createLive(scene, latest.current.settings);
      // Say nothing new for a while: the intro caption is for the learner to read first.
      insight.current.fire(toSeconds(live.world.tick));
      return live;
    },
    step: (l, dt) => {
      for (const e of advance(l, dt)) {
        const say = eventCaption(e, narration(l), told.current);
        if (say) setCaption(say);
      }
    },
    snapshot,
    onSnapshot: (l, s) => {
      const now = toSeconds(l.world.tick);
      if (!insight.current.ready(now)) return;
      const say = insightCaption(s, l.world.settings);
      if (say) {
        insight.current.fire(now);
        setCaption(say);
      }
    },
  });

  useEffect(() => {
    world().world.settings = { ...settings };
  }, [world, settings]);

  const change = (patch: Partial<Settings>) => setSettings((s) => ({ ...s, ...patch }));
  /** A different policy starts the run again, so attempt counts and lag are comparable. */
  const pickPolicy = (policy: Policy) => {
    latest.current = { ...latest.current, settings: { ...settings, policy } };
    change({ policy });
    restart();
  };
  const restart = () => {
    told.current = new Set();
    insight.current = createCooldown(INSIGHT_COOLDOWN_S);
    reset();
    setCaption(introCaption(scene, latest.current.settings, SCENARIOS[scene]));
  };
  const doRedrive = () => {
    const l = world();
    redrive(l.world);
    for (const e of l.world.events.splice(0)) {
      const say = eventCaption(e, narration(l), told.current);
      if (say) setCaption(say);
    }
    refresh();
  };

  useIntroCaption(introCaption(scene, settings, SCENARIOS[scene]), [scene, settings.policy]);

  return (
    <StageFrame
      height={460}
      legend={LEGEND}
      stats={<QueueStats snap={snap} scene={scene} />}
      controls={[
        <>
          {picker}
          {scene === 'poison' && <Segmented label="On error" value={settings.policy} onChange={pickPolicy} options={POLICIES} />}
          {scene !== 'redrive' && settings.policy === 'max-attempts' && (
            <Slider label="Attempts" value={settings.maxAttempts} min={1} max={MAX_ATTEMPTS_LIMIT} onChange={(maxAttempts) => change({ maxAttempts })} />
          )}
          {scene !== 'redrive' && settings.policy !== 'drop' && <Toggle label="Backoff" value={settings.backoff} onChange={(backoff) => change({ backoff })} off="None" on="1 s, 2 s, 4 s…" />}
          {scene === 'poison' && settings.policy === 'max-attempts' && <Toggle label="Classify errors" value={settings.classify} onChange={(classify) => change({ classify })} off="Off" on="Validation → DLQ" />}
          {scene === 'transient' && <Toggle label="While the dependency is down" value={settings.pauseWhenDown} onChange={(pauseWhenDown) => change({ pauseWhenDown })} off="Keep consuming" on="Pause" />}
        </>,
        <>
          {scene !== 'transient' && <Toggle label="The bug" value={settings.bugFixed} onChange={(bugFixed) => change({ bugFixed })} off="Not fixed" on="Fixed" />}
          {scene === 'redrive' && <Toggle label="Consumer dedupes by id" value={settings.dedupe} onChange={(dedupe) => change({ dedupe })} off="No" on="Yes" />}
          {scene === 'redrive' && <Button variant="primary" onClick={doRedrive} disabled={!snap || snap.dlq.length === 0}>Redrive DLQ</Button>}
          <PauseButton paused={paused} onToggle={togglePause} />
          <Button onClick={restart}>↺ Reset</Button>
        </>,
      ]}
    >
      <div className="stage-pad pm">
        {scene === 'transient' && <Dependency snap={snap} />}
        <Lane snap={snap} settings={settings} />
        <div className="pm-outcomes">
          <Dlq snap={snap} />
          <History snap={snap} scene={scene} />
        </div>
        {snap && snap.lagHistory.length > 1 && (
          <div className="pm-lag">
            <SectionTitle weight="regular" hint="messages waiting, last 30 s">Lag</SectionTitle>
            <Sparkline values={snap.lagHistory} width={260} height={36} cap={60} color="var(--info)" minMax={10} />
          </div>
        )}
        <p className="pm-note">A DLQ nobody watches is just a slower way to lose data: alert when its depth is above zero.</p>
        <Hint block>{HONEST}</Hint>
      </div>
    </StageFrame>
  );
}

/** What the captions need to know about the world right now. */
const narration = (l: Live) => ({
  settings: l.world.settings, scenario: l.world.scenario, dlqDepth: l.world.dlq.length, lost: l.world.dropped.length, down: isDown(l.world.scenario, l.world.tick),
});

function QueueStats({ snap, scene }: { snap: Snapshot | null; scene: SceneId }) {
  const s = snap?.stats;
  return (
    <Stats>
      <Stat label="Lag" value={s ? s.lag : NA} color="var(--info)" sub="messages waiting" />
      <Stat label="Oldest waiting" value={s ? `${decimal(s.oldestAge, 1)} s` : NA} color={s && s.oldestAge > 5 ? 'var(--bad)' : undefined} sub="age of the head" />
      <Stat label="Processed" value={s ? s.processed : NA} color="var(--ok)" />
      <Stat label="DLQ depth" value={s ? s.dlq : NA} color="var(--violet)" sub="parked, not lost" />
      <Stat label="Lost ✕" value={s ? s.dropped : NA} color={s && s.dropped > 0 ? 'var(--bad)' : undefined} sub="gone for good" />
      {scene === 'redrive' && <Stat label="Work repeated" value={s ? s.duplicates : NA} color={s && s.duplicates > 0 ? 'var(--orange)' : undefined} sub="duplicate side effects" />}
    </Stats>
  );
}

function Lane({ snap, settings }: { snap: Snapshot | null; settings: Settings }) {
  const lane = snap?.lane ?? [];
  const values = Array.from({ length: LANE_CELLS }, (_, i) => (lane[i] ? `#${lane[i].id}` : ''));
  const retrying = (snap?.headAttempts ?? 0) >= 1;
  const stateOf = (i: number): ArrayCellState => {
    const cell = lane[i];
    if (!cell) return 'dim';
    if (cell.poison) return 'bad';
    return i === 0 ? 'active' : 'idle';
  };
  const classOf = (i: number) => {
    if (!lane[i]) return '';
    if (i === 0) return `pm-head ${retrying ? 'pm-retry' : ''}`;
    return 'pm-wait';
  };
  return (
    <div className="pm-lane">
      <SectionTitle weight="regular" hint="ordered partition: one consumer, strictly in order">Partition</SectionTitle>
      <WideRegion minWidth={LANE_MIN_W} label="Message lane: scroll sideways to see all of it" gutter={{ top: 8, bottom: 4, x: 14 }}>
        <ArrayStrip
          values={values}
          cellState={stateOf}
          cellClass={classOf}
          pointers={lane.length ? [{ i: 0, label: 'consumer', tone: 'hi' }] : []}
          fontSize={13}
          cellTitle={(i) => (lane[i] ? `Message ${lane[i].id}${lane[i].poison ? ' (malformed)' : ''}` : 'empty slot')}
        />
      </WideRegion>
      <p className="pm-status">{statusLine(snap, settings)}</p>
    </div>
  );
}

/** What the consumer is doing right now, from the snapshot. */
function statusLine(snap: Snapshot | null, settings: Settings): ReactNode {
  if (!snap) return null;
  if (snap.headId === null) return <>Queue empty: the consumer is idle.</>;
  const limit = settings.policy === 'max-attempts' ? ` of ${settings.maxAttempts}` : '';
  const head = <>Handling <b>#{snap.headId}</b></>;
  if (snap.paused) return <>{head}: consumption is paused while the dependency is down, so no attempt is made.</>;
  if (snap.headAttempts === 0) return <>{head}.</>;
  const retry = snap.retryIn > 0 ? <>, next try in <span className="hl orange">{decimal(snap.retryIn, 1)} s</span></> : null;
  return <>{head}: attempt <span className="hl orange">{snap.headAttempts}{limit}</span> has failed{retry}. {snap.lane[0]?.poison ? 'Everything behind it waits.' : ''}</>;
}

function Dlq({ snap }: { snap: Snapshot | null }) {
  const entries = snap?.dlq ?? [];
  const shown = entries.slice(-DLQ_ROWS);
  return (
    <div className="pm-dlq">
      <SectionTitle weight="regular" hint={snap && snap.stats.dlq > 0 ? undefined : 'nothing parked'}>Dead-letter queue</SectionTitle>
      <p className={`pm-alarm ${entries.length ? 'is-firing' : ''}`} role="status">
        <span className="chip">{entries.length ? 'ALARM' : 'quiet'}</span> depth {entries.length}{entries.length ? ' > 0' : ''}
      </p>
      {entries.length > shown.length && <p className="pm-more">…and {entries.length - shown.length} earlier</p>}
      {shown.map((e) => (
        <div key={`${e.id}-${e.at}`} className="log-row tone-violet">
          #{e.id} · {errorWords[e.error]} · {plural(e.attempts, 'attempt')} · parked at {decimal(toSeconds(e.at), 1)} s
        </div>
      ))}
    </div>
  );
}

function History({ snap, scene }: { snap: Snapshot | null; scene: SceneId }) {
  const processed = snap?.processed ?? [];
  return (
    <div className="pm-history">
      <SectionTitle weight="regular" hint="most recent last">Processed</SectionTitle>
      <div className="pm-chips" role="list" aria-label="Processed messages">
        {processed.length === 0 && <span className="empty-note">none yet</span>}
        {processed.map((p, i) => (
          <span key={`${p.id}-${i}`} role="listitem" className={`chip tone-ok ${p.redriven ? 'pm-redriven' : ''}`} title={p.redriven ? 'redriven: processed again out of order' : undefined}>
            #{p.id}
          </span>
        ))}
      </div>
      {scene === 'redrive' && snap && snap.redriven.length > 0 && (
        <p className="pm-more">
          Redriven: {snap.redriven.map((r) => `#${r.id} came after #${r.after}`).join(', ')}. Redrive does not keep order.
        </p>
      )}
    </div>
  );
}

function Dependency({ snap }: { snap: Snapshot | null }) {
  const [from, to] = OUTAGE_SCENARIO.outage!;
  const down = snap?.down ?? false;
  return (
    <div className="pm-dependency">
      <SectionTitle weight="regular" hint={down ? 'down right now' : 'up'}>Dependency the consumer calls</SectionTitle>
      <WideRegion minWidth={LANE_MIN_W} label="Dependency timeline: scroll sideways to see all of it">
        <GanttLanes
          lanes={[{ id: 'dep', label: 'dependency' }]}
          bars={[{ id: 'down', lane: 'dep', start: from, end: to, tone: 'bad', label: 'down' }]}
          domain={[0, TIMELINE_SPAN]}
          now={Math.min(snap?.time ?? 0, TIMELINE_SPAN)}
          unit=" s"
          axis
          size="md"
          labelWidth={86}
          ariaLabel={`The dependency is down from ${from} to ${to} seconds`}
        />
      </WideRegion>
    </div>
  );
}
