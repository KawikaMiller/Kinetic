import { Link } from 'react-router-dom';
import { Bar } from '../../components/Bar';
import { Sparkline } from '../../components/Sparkline';
import { isBuilt } from '../../core/lessons';
import { ALERT_FRACTION, GAUGES, MAX_HOURS, hitHours, usageAt, type GaugeId, type Load } from './model';
import { formatValue, gaugeTone, history } from './view';

const SPARK_W = 96;
const SPARK_H = 26;
const SPARK_STEP_HOURS = 0.5;
const SPARK_POINTS = MAX_HOURS / SPARK_STEP_HOURS + 1;
const PERCENT = 100;

/** A link to the lesson that teaches this gauge's mechanism, or its plain name while that lesson is not built yet. */
export function LessonRef({ id }: { id: string }) {
  return isBuilt(id) ? (
    <Link className="re-lesson" to={`/lesson/${id}`}>
      {id}
    </Link>
  ) : (
    <span className="re-lesson is-soon" title="This lesson is not built yet">
      {id}
    </span>
  );
}

/** One limit: the reading against the limit and the 80% alert line, its history, the error it ends in, and where to learn how it works. */
export function GaugeRow({ id, load, hours, alertOn }: { id: GaugeId; load: Load; hours: number; alertOn: boolean }) {
  const g = GAUGES[id];
  const used = usageAt(id, load, hours);
  const tone = gaugeTone(id, load, hours);
  const willFail = hitHours(id, load) !== null;
  return (
    <div className={`box re-gauge is-${tone}`}>
      <div className="re-gauge-head">
        <b>{g.label}</b>
        <span className="re-gauge-value">
          {formatValue(id, used)} <span className="re-faint">of {formatValue(id, g.limit)}</span>
        </span>
        {tone === 'bad' ? <span className="chip tone-bad">{g.error}</span> : <span className="re-faint">fails as {g.error}</span>}
        {willFail && !alertOn && <span className="chip tone-orange" title="Nothing warns you before this limit is hit">no early warning</span>}
        {alertOn && <span className="chip tone-orange">alert at {ALERT_FRACTION * PERCENT}%</span>}
        <LessonRef id={g.lesson} />
      </div>
      <div className="re-gauge-body">
        <div className="re-gauge-bar">
          <Bar
            value={used}
            max={g.limit}
            tone={tone === 'dim' ? 'dim' : tone}
            height={12}
            markers={[{ at: g.limit * ALERT_FRACTION, tone: 'orange' }]}
            ariaLabel={`${g.label}: ${formatValue(id, used)} of ${formatValue(id, g.limit)}`}
          />
        </div>
        <Sparkline values={history(id, load, hours, SPARK_STEP_HOURS)} width={SPARK_W} height={SPARK_H} cap={SPARK_POINTS} align="left" max={PERCENT} refLine={ALERT_FRACTION * PERCENT} color={tone === 'bad' ? 'var(--bad)' : 'var(--info)'} />
      </div>
    </div>
  );
}
