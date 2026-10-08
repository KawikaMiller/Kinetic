import { useMemo, useState, type ReactNode } from 'react';
import { Bars, Plot2D } from '../../components/Plot2D';
import { SectionTitle } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { Hint, Legend, Slider, Stat, Stats, Toggle } from '../../components/ui';
import { useSetCaption } from '../../core/caption';
import { useEffect } from 'react';
import { expiryCaption, spreadCaption } from './captions';
import { expireHotKey, expireMany, LOAD_TIME } from './stampede';

const HOT_SEED = 3;
const MANY_SEED = 3;
const KEYS = 200;
const MANY_TTL = 60;
const JITTER = 0.2;
/** Width of a bucket in the hot-key chart, seconds. */
const BUCKET = 0.05;
const BUCKETS = 14;
const SPREAD_FROM = 40;
const HONEST = 'Simulated requests and database loads, seeded; every number is illustrative.';

const LEGEND = (
  <Legend
    items={[
      { color: 'var(--info)', label: 'database loads' },
      { color: 'var(--violet)', label: 'coalesced into one' },
    ]}
  />
);

export function StampedeScene({ picker }: { picker: ReactNode }) {
  const setCaption = useSetCaption();
  const [rate, setRate] = useState(200);
  const [coalesce, setCoalesce] = useState(false);
  const [jitter, setJitter] = useState(false);

  const hot = useMemo(() => expireHotKey(rate, coalesce, HOT_SEED), [rate, coalesce]);
  const many = useMemo(() => expireMany(KEYS, MANY_TTL, jitter ? JITTER : 0, MANY_SEED), [jitter]);

  // The caption follows whichever control was touched last.
  const [last, setLast] = useState<'hot' | 'many'>('hot');
  useEffect(() => {
    setCaption(last === 'hot' ? expiryCaption(rate, coalesce, hot) : spreadCaption(jitter ? JITTER : 0, KEYS, MANY_TTL, many));
  }, [setCaption, last, rate, coalesce, hot, jitter, many]);

  const hotBars = useMemo(() => {
    const counts = Array.from({ length: BUCKETS }, () => 0);
    for (const t of hot.loadStarts) counts[Math.min(BUCKETS - 1, Math.floor(t / BUCKET))] += 1;
    const first = Math.floor(hot.loadStarts[0] / BUCKET);
    return counts.map((y, i) => ({ x0: (i - first) * BUCKET * 1000, x1: (i - first + 1) * BUCKET * 1000, y }));
  }, [hot]);
  const hotTop = Math.max(10, ...hotBars.map((b) => b.y));
  const spreadBars = many.perSecond.map((y, second) => ({ x0: second, x1: second + 1, y })).filter((b) => b.x0 >= SPREAD_FROM);

  return (
    <StageFrame
      height={460}
      legend={LEGEND}
      stats={
        <Stats>
          <Stat label="Requests that missed" value={hot.misses} sub={`in the ${LOAD_TIME * 1000} ms the first load takes`} />
          <Stat label="Loads on the database" value={hot.loads} color={hot.loads > 1 ? 'var(--bad)' : 'var(--ok)'} sub="for the one hot key" />
          <Stat label="Busiest second" value={many.peak} color={many.peak > KEYS / 4 ? 'var(--bad)' : 'var(--ok)'} sub={`loads, of ${KEYS} keys expiring`} />
        </Stats>
      }
      controls={[
        <>
          {picker}
          <Slider label="Requests a second" value={rate} min={20} max={400} step={20} onChange={(v) => { setLast('hot'); setRate(v); }} />
          <Toggle label="Hot key expires" value={coalesce} onChange={(v) => { setLast('hot'); setCoalesce(v); }} off="Everyone loads" on="One load, others wait" />
          <Toggle label="Many keys, one TTL" value={jitter} onChange={(v) => { setLast('many'); setJitter(v); }} off="Same TTL" on="TTL ± 20%" />
        </>,
      ]}
    >
      <div className="stage-pad cp">
        <SectionTitle weight="regular" hint="database loads started, per 50 ms after the first miss">One hot key expires</SectionTitle>
        <Plot2D
          x={{ domain: [0, BUCKETS * BUCKET * 1000], label: 'milliseconds after the first miss' }}
          y={{ domain: [0, hotTop], label: 'loads' }}
          ariaLabel={`${hot.loads} database loads after the hot key expired`}
        >
          <Bars bars={hotBars} tone={coalesce ? 'violet' : 'info'} />
        </Plot2D>
        <SectionTitle weight="regular" hint={`${KEYS} keys stored together, each reloaded as it expires`}>Many keys expire together</SectionTitle>
        <Plot2D
          x={{ domain: [SPREAD_FROM, 80], label: 'seconds since they were stored' }}
          y={{ domain: [0, KEYS], label: 'loads' }}
          ariaLabel={`Database loads per second as ${KEYS} keys expire; the busiest second has ${many.peak}`}
        >
          <Bars bars={spreadBars} tone="info" />
        </Plot2D>
        <Hint block>{HONEST}</Hint>
      </div>
    </StageFrame>
  );
}
