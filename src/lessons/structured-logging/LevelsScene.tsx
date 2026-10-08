import { useMemo, useState, type ReactNode } from 'react';
import { Bar } from '../../components/Bar';
import { StageFrame } from '../../components/StageFrame';
import { ChipButton, ControlGroup, Hint, Legend, Segmented, Stat, Stats } from '../../components/ui';
import { useIntroCaption } from '../../core/caption';
import { bytes, pct } from '../../core/format';
import { LogStream, type StreamRow } from './LogStream';
import {
  BUDGET_GB_PER_DAY, DEFAULT_SEED, LEVELS, PRICE_PER_GB, REQUESTS_PER_SECOND, bytesPerRequest, countByLevel, dollarsPerMonth, displayParts, gbPerDay, keptLines, makeRun, textParts, type Format, type Level,
} from './model';

const BAR_MAX_GB = BUDGET_GB_PER_DAY * 2.5;
const DOLLARS = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`;
const gb = (n: number) => `${n.toFixed(1)} GB`;

export function LevelsScene({ picker }: { picker: ReactNode }) {
  const run = useMemo(() => makeRun(DEFAULT_SEED), []);
  const [min, setMin] = useState<Level>('INFO');
  const [format, setFormat] = useState<Format>('json');

  const kept = keptLines(run.events, min);
  const perRequest = bytesPerRequest(run, min, format);
  const perDay = gbPerDay(perRequest);
  const over = perDay > BUDGET_GB_PER_DAY;
  const counts = countByLevel(run.events, min);
  const rows: StreamRow[] = kept.map((e) => {
    const d = displayParts(e, format, false);
    return { key: e.seq, service: e.service, level: e.level, head: d.head, tag: format === 'text' ? textParts(e).tag : e.service, body: d.body, match: null };
  });

  useIntroCaption(
    <>
      Keeping <b>{min}</b> and above: {kept.length} of {run.events.length} lines, <b>{bytes(perRequest)}</b> per request, <span className={over ? 'hl bad' : 'hl ok'}>{gb(perDay)} a day</span> at {REQUESTS_PER_SECOND} requests a second,{' '}
      {over ? 'over' : 'inside'} the {BUDGET_GB_PER_DAY} GB budget ({pct(perDay / BUDGET_GB_PER_DAY, 0)} of it).
    </>,
    [min, format, kept.length, perDay, over, perRequest, run.events.length],
  );

  return (
    <StageFrame
      height={440}
      stats={
        <Stats>
          <Stat label="Lines kept" value={`${kept.length} / ${run.events.length}`} />
          <Stat label="Per request" value={bytes(perRequest)} />
          <Stat label="Per day" value={gb(perDay)} color={over ? 'var(--bad)' : 'var(--ok)'} />
          <Stat label="Per month" value={DOLLARS(dollarsPerMonth(perDay))} sub={`at $${PRICE_PER_GB.toFixed(2)} a GB (illustrative)`} color={over ? 'var(--bad)' : 'var(--ok)'} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--ok)', label: 'inside the budget' },
            { color: 'var(--bad)', label: 'over the budget' },
            { color: 'var(--orange)', label: 'budget line', shape: 'line' },
            { color: 'var(--orange)', label: 'WARN lines', shape: 'square' },
            { color: 'var(--bad)', label: 'ERROR lines', shape: 'square' },
          ]}
        />
      }
      controls={[
        picker,
        <>
          <Segmented label="Minimum level" value={min} onChange={setMin} options={LEVELS.map((l) => ({ value: l, label: l }))} />
          <Segmented label="Log format" value={format} onChange={setFormat} options={[{ value: 'text', label: 'Free text' }, { value: 'json', label: 'Structured JSON' }]} />
          <ControlGroup label="Presets" inline>
            <ChipButton tone="info" on={min === 'INFO'} onClick={() => setMin('INFO')}>
              Sensible production
            </ChipButton>
            <ChipButton tone="bad" on={min === 'DEBUG'} onClick={() => setMin('DEBUG')}>
              Debug left on in production
            </ChipButton>
          </ControlGroup>
        </>,
      ]}
    >
      <div className="sl stage-pad">
        <Bar
          value={perDay}
          max={BAR_MAX_GB}
          tone={over ? 'bad' : 'ok'}
          height={14}
          markers={[{ at: BUDGET_GB_PER_DAY, label: `budget ${BUDGET_GB_PER_DAY} GB/day`, tone: 'orange' }]}
          label={`Log volume, GB a day`}
          trailing={gb(perDay)}
          ariaLabel={`${gb(perDay)} a day against a ${BUDGET_GB_PER_DAY} GB budget`}
        />
        <div className="sl-levels">
          {LEVELS.map((l) => (
            <span key={l} className={`sl-level${levelRankDropped(l, min) ? ' sl-dropped' : ''}`}>
              {l} <b>{counts[l]}</b>
            </span>
          ))}
        </div>
        <LogStream rows={rows} label="Lines kept at this level" />
        <Hint block>
          Simulated services and logs; the traffic ({REQUESTS_PER_SECOND} requests a second), the {BUDGET_GB_PER_DAY} GB budget and the ${PRICE_PER_GB.toFixed(2)} a GB price are made up for illustration. Bytes are
          measured on the lines shown, averaged over these 10 requests (one fails); a real service's mix differs. Structured lines also cost more bytes each than the same line in free text, because every field is named: you pay for searchability.
        </Hint>
      </div>
    </StageFrame>
  );
}

const levelRankDropped = (l: Level, min: Level) => LEVELS.indexOf(l) < LEVELS.indexOf(min);
