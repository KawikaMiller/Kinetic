import { useMemo, useState, type ReactNode } from 'react';
import { Bar } from '../../components/Bar';
import { Plot2D, Points, Polygon, VLine } from '../../components/Plot2D';
import { SeedField } from '../../components/SeedField';
import { StageFrame } from '../../components/StageFrame';
import { WideRegion } from '../../components/WideRegion';
import { ChipButton, Hint, Legend, Provenance, ProvenanceRow, Segmented, Slider, Stat, Stats } from '../../components/ui';
import { pctText } from '../../core/format';
import { DAYS, FIRST_ASOF_DAY, LAST_ASOF_DAY, USERS, USERS_MIN, WINDOW_DAYS, dayLabel } from './events';
import { LengthField } from './LengthField';
import { NO_SOURCES, SOURCES, SOURCE_LABEL, type Source, type SourceSet } from './feature';
import { PIPELINE_OPENING, dotTone, pipelineCaption, pipelineView } from './view';

const ROW_LIMIT = 12;

/** Scene 1: the same feature computed by a batch pipeline and a streaming pipeline, with four ways for them to disagree. */
export function PipelineScene({ picker }: { picker: ReactNode }) {
  const [seed, setSeed] = useState<number>(PIPELINE_OPENING.seed);
  const [users, setUsers] = useState<number>(PIPELINE_OPENING.users);
  const [windowDays, setWindowDays] = useState<number>(PIPELINE_OPENING.windowDays);
  const [latePercent, setLatePercent] = useState(PIPELINE_OPENING.lateShare * 100);
  const [sources, setSources] = useState<SourceSet>(PIPELINE_OPENING.sources);
  const [shared, setShared] = useState<boolean>(PIPELINE_OPENING.shared);

  const view = useMemo(() => pipelineView(seed, users, latePercent / 100, windowDays, sources, shared), [seed, users, latePercent, windowDays, sources, shared]);
  const flip = (s: Source) => setSources((cur) => ({ ...cur, [s]: !cur[s] }));
  const focus = view.first?.row ?? view.rows[0];
  const focusEvents = focus ? view.table.byUser[focus.user] : [];
  const start = focus ? focus.asOf - windowDays : 0;
  const share = (s: Source) => view.each.find((e) => e.source === s);
  const total = view.rows.length;

  return (
    <StageFrame
      height={720}
      intro={pipelineCaption(view, sources, shared)}
      introKey={`pipelines|${seed}|${users}|${windowDays}|${latePercent}|${SOURCES.map((s) => (sources[s] ? 1 : 0)).join('')}|${shared}`}
      stats={
        <Stats>
          <Stat label="Rows that differ" value={`${view.count.toLocaleString('en-US')} of ${total.toLocaleString('en-US')}`} color={view.count === 0 ? 'var(--ok)' : 'var(--bad)'} sub={total === 0 ? 'no rows' : pctText(view.share, 1)}>
            <Bar value={view.count} max={Math.max(1, total)} tone={view.count === 0 ? 'ok' : 'bad'} height={8} ariaLabel={`${view.count} of ${total} rows differ`} />
          </Stat>
          <Stat label="Users and as-of times" value={`${users} x ${LAST_ASOF_DAY - FIRST_ASOF_DAY + 1}`} sub="one row per user per day at 12:00 UTC" />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--ok)', label: 'the two pipelines agree on the row', shape: 'square' },
            { color: 'var(--bad)', label: 'they differ', shape: 'square' },
            { color: 'var(--sky)', label: 'offline (batch)', shape: 'square' },
            { color: 'var(--amber)', label: 'online (streaming)', shape: 'square' },
            { color: 'var(--violet)', label: 'a late event', shape: 'dot' },
            { color: 'var(--hi)', label: 'an event exactly on the window start (even if it was also late)', shape: 'dot' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <Segmented label="Definition" value={shared} onChange={setShared} options={[{ value: false, label: 'two pipelines' }, { value: true, label: 'one shared definition' }]} />
        </>,
        <>
          {SOURCES.map((s) => (
            <ChipButton key={s} tone="orange" on={sources[s]} onStyle="solid" onClick={() => flip(s)}>{SOURCE_LABEL[s]}{share(s) ? `: ${share(s)?.count} rows alone` : ''}</ChipButton>
          ))}
          <ChipButton onClick={() => setSources(NO_SOURCES)}>all off</ChipButton>
        </>,
        <>
          <LengthField label="Users" value={users} min={USERS_MIN} max={USERS} onValue={setUsers} />
          <LengthField label="Window (days)" value={windowDays} min={WINDOW_DAYS.min} max={WINDOW_DAYS.max} onValue={setWindowDays} />
          <Slider label="Late events" value={latePercent} min={0} max={100} step={5} format={(v) => `${v}%`} onChange={setLatePercent} />
          <SeedField seed={seed} onSeed={setSeed} />
        </>,
      ]}
    >
      <div className="fss-stage stage-pad">
        <div className="fss-list" role="list" aria-label={view.count > 0 ? 'Rows where the pipelines differ' : 'The first rows'}>
          {view.listed.map((r) => (
            <div key={`${r.user}:${r.day}`} role="listitem" className={`fss-card ${r.differs ? 'is-diff' : 'is-same'}`}>
              <b>user {r.user + 1}</b>
              <span>{dayLabel(r.asOf)} UTC</span>
              <span className="fss-offline">orders_7d {r.offline.orders7d} offline</span>
              <span className="fss-online">{r.online.orders7d} online</span>
              <span className="fss-offline">today {r.offline.ordersToday} offline</span>
              <span className="fss-online">{r.online.ordersToday} online</span>
            </div>
          ))}
          <Hint tone="muted">{view.count > 0 ? `The first ${Math.min(ROW_LIMIT, view.count)} of ${view.count} differing rows.` : `The first ${Math.min(ROW_LIMIT, total)} of ${total} rows: none differ.`}</Hint>
        </div>
        {view.first && view.first.causes.length > 0 && (
          <ul className="fss-causes">
            {view.first.causes.map((c) => <li key={c.source}><b>{SOURCE_LABEL[c.source]}:</b> {c.text}.</li>)}
          </ul>
        )}
        {focus && (
          <figure className="fss-figure">
            <figcaption>User {focus.user + 1}: events as dots, the window before {dayLabel(focus.asOf)} shaded</figcaption>
            <WideRegion minWidth={420} label="The event timeline: scroll sideways to see all of it">
              <Plot2D x={{ domain: [0, DAYS], label: 'day', ticks: 6 }} y={{ domain: [0, 1], label: '', ticks: 0 }} width={460} height={130} ariaLabel={`Events of user ${focus.user + 1} with the window before ${dayLabel(focus.asOf)}`}>
                <Polygon points={[[start, 0], [focus.asOf, 0], [focus.asOf, 1], [start, 1]]} tone="info" />
                <VLine at={focus.asOf} tone="hi" dashed />
                <Points
                  data={focusEvents.map((e) => ({ x: e.at, y: 0.5, tone: dotTone(e, start) }))}
                  r={4}
                />
              </Plot2D>
            </WideRegion>
          </figure>
        )}
        <Hint tone="muted" className="fss-note">
          This lesson is about event-time semantics, not preprocessing code: the training-vs-inference lesson owns the standardisation mismatch, and the model-evals-drift lesson owns a world that changes. Here the world is fixed and two pipelines still disagree.
          The shared definition is a half-open window, only events that had arrived by the as-of time, UTC days and null read as 0.
        </Hint>
        <ProvenanceRow>
          <Provenance kind="illustrative" seed={seed}>a made-up event stream: {users} users, {DAYS} days, {pctText(latePercent / 100, 0)} of events arriving 1 to 48 hours late</Provenance>
          <Provenance kind="simulated">two functions in this page, not a streaming system: nothing here runs a batch or streaming engine</Provenance>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}
