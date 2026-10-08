import { useEffect, useState, type ReactNode } from 'react';
import { Bar } from '../../components/Bar';
import { Box, SectionTitle } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { Button, Hint, Legend, Slider, Stat, Stats, Toggle } from '../../components/ui';
import { useIntroCaption, useSetCaption } from '../../core/caption';
import { useInterval } from '../../core/useInterval';
import { backgroundCaption, constraintsIntro } from './captions';
import {
  BACKGROUND_BUDGET_S, EMPTY_FEED, MESSAGES_PER_DAY, POLL_RANGE, WORK_RANGE, pollingDay, pushDay, refreshFeed, runInBackground, setNetwork,
} from './constraints';

/** One simulated second of background work plays in this many ms, so a 60 s task is over in 3 s. */
const MS_PER_SIM_SECOND = 50;
const BATTERY_MAX_PCT = 30;
const SIGNAL_BARS = 4;

const FEED_TEXT = {
  idle: 'No feed loaded yet. Press Refresh.',
  loaded: 'Feed loaded: you are up to date.',
  failed: 'Could not reach the server. The refresh is waiting for a connection.',
} as const;

export function ConstraintsScene({ picker }: { picker: ReactNode }) {
  const setCaption = useSetCaption();
  useIntroCaption(constraintsIntro);
  const [online, setOnline] = useState(true);
  const [feed, setFeed] = useState(EMPTY_FEED);
  const [work, setWork] = useState(45);
  const [checkpointed, setCheckpointed] = useState(false);
  const [elapsed, setElapsed] = useState<number | null>(null);
  const [pollMin, setPollMin] = useState(5);

  const run = runInBackground(work, checkpointed);
  const running = elapsed !== null && elapsed < run.done;
  useInterval(() => setElapsed((e) => (e === null ? e : Math.min(e + 1, run.done))), MS_PER_SIM_SECOND, running);
  const shown = elapsed ?? 0;
  const cutOff = elapsed !== null && !running && !run.finished;

  const finishedAt = run.done;
  useEffect(() => {
    if (elapsed !== null && elapsed >= finishedAt) setCaption(backgroundCaption(runInBackground(work, checkpointed), work, checkpointed));
  }, [elapsed, finishedAt, work, checkpointed, setCaption]);

  /** A changed setting makes the last result stale: forget the run and its caption. */
  const resetRun = () => {
    setElapsed(null);
    setCaption(constraintsIntro);
  };

  const goOnline = (value: boolean) => {
    setOnline(value);
    setFeed(setNetwork(feed, value));
  };
  const polling = pollingDay(pollMin);
  const push = pushDay();

  return (
    <StageFrame
      height={470}
      legend={
        <Legend
          items={[
            { color: 'var(--ok)', label: 'finished, or the cheap side' },
            { color: 'var(--bad)', label: 'cut off, or the costly side' },
            { color: 'var(--dim)', label: 'no network' },
          ]}
        />
      }
      stats={
        <Stats>
          <Stat label="Network" value={online ? 'online' : 'offline'} />
          <Stat label="Background budget" value={`${BACKGROUND_BUDGET_S} s`} />
          <Stat label="Polling wake-ups a day" value={polling.wakeups} />
        </Stats>
      }
      controls={[
        <>
          {picker}
          <Toggle label="Network" value={online} onChange={goOnline} off="Offline" on="Online" />
          <Button onClick={() => setFeed(refreshFeed(feed, online))}>Refresh</Button>
        </>,
        <>
          <Slider label="Task needs" value={work} min={WORK_RANGE.min} max={WORK_RANGE.max} step={5} onChange={(v) => { setWork(v); resetRun(); }} format={(v) => `${v} s`} />
          <Toggle label="Save progress as it goes" value={checkpointed} onChange={(v) => { setCheckpointed(v); resetRun(); }} />
          <Button onClick={() => setElapsed(0)}>Run in the background</Button>
          <Slider label="Poll every" value={pollMin} min={POLL_RANGE.min} max={POLL_RANGE.max} onChange={setPollMin} format={(v) => `${v} min`} />
        </>,
      ]}
    >
      <div className="mal stage-pad mal-constraints">
        <Box className="mal-panel">
          <SectionTitle>A flaky network</SectionTitle>
          <div className="mal-net">
            <span className={`mal-signal is-big ${online ? '' : 'is-off'}`} aria-hidden>
              {Array.from({ length: SIGNAL_BARS }, (_, i) => <i key={i} style={{ height: 8 + i * 6 }} />)}
            </span>
            <p className={`mal-feed is-${feed.status}`} role="status">{FEED_TEXT[feed.status]}</p>
          </div>
          <Hint block>Feed loaded {feed.loads} {feed.loads === 1 ? 'time' : 'times'}. Go offline, press Refresh, then go back online: the waiting refresh finishes by itself.</Hint>
        </Box>

        <Box className="mal-panel">
          <SectionTitle>A background task and its budget</SectionTitle>
          <Bar
            value={Math.min(shown, work)} max={work} tone={cutOff ? 'bad' : elapsed !== null && !running ? 'ok' : 'hi'}
            markers={work > BACKGROUND_BUDGET_S ? [{ at: BACKGROUND_BUDGET_S, label: `OS cuts it off at ${BACKGROUND_BUDGET_S} s`, tone: 'bad' }] : []}
            transition={{ duration: 0.05 }} height={12} ariaLabel={`${shown} of ${work} seconds of work done`}
          />
          <p className="mal-result" role="status">
            {elapsed === null
              ? 'Press Run in the background.'
              : running
                ? `${shown} s of ${work} s done…`
                : run.finished
                  ? `All ${work} s done in time.`
                  : `Cut off after ${run.done} s. ${checkpointed ? `${run.remaining} s left to do later.` : `${run.redo} s of work thrown away.`}`}
          </p>
        </Box>

        <Box className="mal-panel">
          <SectionTitle hint="battery used in a day, illustrative">Polling or push</SectionTitle>
          <Bar
            label={`Polling every ${pollMin} min: ${polling.wakeups} wake-ups, ${polling.empty} with nothing new`}
            trailing={`${polling.batteryPct.toFixed(1)}%`} value={polling.batteryPct} max={BATTERY_MAX_PCT} tone="bad" height={10}
          />
          <Bar label={`Push: ${MESSAGES_PER_DAY} wake-ups, one per message`} trailing={`${push.batteryPct.toFixed(1)}%`} value={push.batteryPct} max={BATTERY_MAX_PCT} tone="ok" height={10} />
        </Box>
        <Hint block>
          Simulated phone. The 30 s budget, the wake-up cost and 12 messages a day are illustrative numbers, not measurements; real limits vary by platform, version and device.
        </Hint>
      </div>
    </StageFrame>
  );
}
