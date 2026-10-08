import { type ReactNode } from 'react';
import { StageFrame } from '../../components/StageFrame';
import { ChipButton, ControlGroup, Hint, Legend, PauseButton, Slider, Stat, Stats } from '../../components/ui';
import { useIntroCaption } from '../../core/caption';
import { GAUGES, GAUGE_IDS, MAX_HOURS, firstIncident, formatHours } from './model';
import { GaugeRow } from './GaugeRow';
import { LeakControls } from './LeakControls';
import type { RunState } from './useRunState';
import { clockLabel, logEntries } from './view';

const TIME_STEP_HOURS = 0.5;

export function GaugesScene({ picker, run }: { picker: ReactNode; run: RunState }) {
  const { load, hours, alerts } = run;
  const incident = firstIncident(load);
  const entries = logEntries(load, alerts).filter((e) => e.at <= hours);
  const failed = incident !== null && incident.hours <= hours;

  useIntroCaption(
    incident === null ? (
      <>
        With these leaks and this traffic, <span className="hl ok">nothing reaches its limit</span> within {MAX_HOURS} hours. Turn a leak on, or raise the traffic.
      </>
    ) : failed ? (
      <>
        <span className="hl bad">{GAUGES[incident.gauge].label}</span> ran out {formatHours(incident.hours)} in: <b>{GAUGES[incident.gauge].error}</b>
        {alerts.has(incident.gauge) ? ', after its 80% alert had already fired.' : ', with no warning before it.'}
      </>
    ) : (
      <>
        {GAUGES[incident.gauge].label} is the first limit to be hit, at {formatHours(incident.hours)}. Drag the clock or press play to get there.
      </>
    ),
    [incident?.gauge, incident?.hours, failed, alerts.has(incident?.gauge ?? 'disk')],
  );

  return (
    <StageFrame
      height={520}
      stats={
        <Stats>
          <Stat label="Clock" value={`${formatHours(hours)} in`} />
          <Stat label="First limit" value={incident ? GAUGES[incident.gauge].label : 'none'} color={incident ? 'var(--bad)' : 'var(--ok)'} sub={incident ? `at ${formatHours(incident.hours)}` : `within ${MAX_HOURS} h`} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--info)', label: 'filling', shape: 'square' },
            { color: 'var(--hi)', label: 'past the alert line', shape: 'square' },
            { color: 'var(--bad)', label: 'at its limit', shape: 'square' },
            { color: 'var(--dim)', label: 'idle', shape: 'square' },
            { color: 'var(--orange)', label: 'alert line (80%)', shape: 'line' },
          ]}
        />
      }
      controls={[
        picker,
        <>
          <Slider label="Clock" value={hours} min={0} max={MAX_HOURS} step={TIME_STEP_HOURS} onChange={run.setHours} format={formatHours} />
          <PauseButton paused={!run.playing} onToggle={() => run.setPlaying(!run.playing)} />
        </>,
        <LeakControls key="leaks" run={run} />,
        <ControlGroup key="alerts" label="Alert at 80%" inline>
          {GAUGE_IDS.map((g) => (
            <ChipButton key={g} tone="orange" on={alerts.has(g)} onClick={() => run.toggleAlert(g)}>
              {GAUGES[g].label}
            </ChipButton>
          ))}
          <ChipButton tone="orange" onClick={() => run.setAlerts(GAUGE_IDS)}>
            all
          </ChipButton>
          <ChipButton tone="orange" onClick={() => run.setAlerts([])}>
            none
          </ChipButton>
        </ControlGroup>,
      ]}
    >
      <div className="re stage-pad">
        <div className="re-gauges">
          {GAUGE_IDS.map((g) => (
            <GaugeRow key={g} id={g} load={load} hours={hours} alertOn={alerts.has(g)} />
          ))}
        </div>
        <div className="re-log" role="log" aria-label="What has happened up to the clock" tabIndex={0}>
          {entries.length === 0 && <div className="empty-note">Nothing has happened yet.</div>}
          {[...entries].reverse().map((e, i) => (
            <div key={`${e.at}-${i}`} className={`log-row tone-${e.kind === 'alert' ? 'hi' : e.kind === 'first' ? 'bad' : 'orange'}`}>
              <span className="re-faint">{clockLabel(e.at)}</span> {e.text}
            </div>
          ))}
        </div>
        <Hint block>
          Simulated server: every limit, leak rate and the traffic are illustrative, and each leak adds a fixed amount per request. The ephemeral-port range (32768-60999) and the 60 s TIME_WAIT are the Linux defaults, and the port gauge models connections to one upstream address and port, since ports run out per destination. After the first
          failure the gauges keep going as if the service stayed up, to show what would fail next. Error wording is typical, not exact for every system.
        </Hint>
      </div>
    </StageFrame>
  );
}
