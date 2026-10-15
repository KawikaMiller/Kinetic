import type { ReactNode } from 'react';
import { Bar } from './Bar';
import { bandOfValue, type MeterBand } from './meterBands';

const NOT_MEASURED = 'not measured yet';
const METER_HEIGHT = 12;

/**
 * One metric against its bands: the name and "value · band" on one line, a meter whose fill
 * takes the band's colour, with ticks at the band edges that have one. Extracted from
 * core-web-vitals' local meter. `max` is where the track ends, in the units of `value` and `upTo`;
 * `value: null` is a metric that hasn't been measured (empty muted track). `header` goes above
 * the name line, for a title and a definition. `ariaLabel` names the whole thing as one image
 * (default: the label and the readout).
 */
export function MetricMeter({
  label, value, unit = '', max, bands, header, format = (v) => `${v}${unit}`, ariaLabel, className = '',
}: {
  label: string;
  value: number | null;
  unit?: string;
  max: number;
  /** In ascending order of `upTo`. */
  bands: readonly MeterBand[];
  header?: ReactNode;
  /** The value as written in the readout (default: the number and `unit`). */
  format?: (value: number) => string;
  ariaLabel?: string;
  className?: string;
}) {
  const band = value === null ? null : bandOfValue(value, bands);
  const readout = value === null ? NOT_MEASURED : `${format(value)} · ${band!.label}`;
  return (
    <div className={`metric-meter ${className}`}>
      {header}
      <div className="metric-meter-head">
        <span className="metric-meter-label">{label}</span>
        <span className={`metric-meter-value ${band ? `tone-${band.tone}` : ''}`}>{readout}</span>
      </div>
      <Bar
        value={value ?? 0}
        max={max}
        tone={band ? band.tone : 'muted'}
        height={METER_HEIGHT}
        markers={bands.flatMap((b) => (b.tick ? [{ at: b.upTo, label: b.tick.label, tone: b.tick.tone }] : []))}
        ariaLabel={ariaLabel ?? `${label}: ${readout}`}
      />
    </div>
  );
}
