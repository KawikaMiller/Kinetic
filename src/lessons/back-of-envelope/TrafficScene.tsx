import { useState, type ReactNode } from 'react';
import { Box, SectionTitle } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { Hint, Legend, Provenance, Slider, Stat, Stats, TextField, Toggle } from '../../components/ui';
import { useIntroCaption } from '../../core/caption';
import { pctText } from '../distributions/fmt';
import { trafficCaption } from './frames';
import { SECONDS_PER_DAY, SHORTCUT_ERROR, TRAFFIC_DEFAULT, bigText, parseDau, traffic } from './model';
import { useNumberField } from './useNumberField';

const DAU_EXPONENT = { min: 3, max: Math.log10(2e9), step: 0.05 } as const;

export function TrafficScene({ picker }: { picker: ReactNode }) {
  const dau = useNumberField(TRAFFIC_DEFAULT.dau, parseDau);
  const actionsField = useNumberField(String(TRAFFIC_DEFAULT.actions), (t) => parseDau(t));
  const [peak, setPeak] = useState(TRAFFIC_DEFAULT.peak);
  const [reads, setReads] = useState(TRAFFIC_DEFAULT.reads);
  const [round, setRound] = useState(TRAFFIC_DEFAULT.round);

  const t = traffic({ dau: dau.value, actionsPerUser: actionsField.value, peakFactor: peak, readsPerWrite: reads, round });
  useIntroCaption(trafficCaption(t, peak, round), [dau.value, actionsField.value, peak, reads, round]);

  const exponent = Math.min(DAU_EXPONENT.max, Math.max(DAU_EXPONENT.min, Math.log10(dau.value)));
  const days = t.secondsPerDay.toLocaleString('en-US');

  return (
    <StageFrame
      height={420}
      stats={
        <Stats>
          <Stat label="Average" value={`${bigText(t.average.value)} /s`} color="var(--hi)" sub={['requests per second', 'units: req/s']} />
          <Stat label="Peak" value={`${bigText(t.peak.value)} /s`} color="var(--hi)" sub={[`average × ${peak}`, 'units: req/s']} />
          <Stat label="Reads · writes at peak" value={`${bigText(t.reads.value)} · ${bigText(t.writes.value)}`} sub={[`${reads} reads per write`]} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--info)', label: 'an input you set' },
            { color: 'var(--hi)', label: 'a derived quantity' },
            { color: 'var(--dim)', label: 'a unit that cancels' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <TextField label="Daily active users" value={dau.text} onChange={dau.onChange} width={150} spellCheck={false} />
          <Slider label="log scale" value={exponent} {...DAU_EXPONENT} format={() => bigText(dau.value)} onChange={(e) => dau.onChange(Math.round(10 ** e).toLocaleString('en-US'))} />
        </>,
        <>
          <TextField label="Actions per user per day" value={actionsField.text} onChange={actionsField.onChange} width={100} spellCheck={false} />
          <Slider label="Peak ÷ average (illustrative)" value={peak} min={1} max={10} onChange={setPeak} />
          <Slider label="Reads per write" value={reads} min={1} max={100} onChange={setReads} />
          <Toggle label="Seconds per day" value={round} onChange={setRound} off="86,400 (exact)" on="100,000 (round)" />
        </>,
      ]}
    >
      <div className="boe-stage stage-pad">
        <Box className="boe-strip">
          <SectionTitle hint="units cancel like fractions">Unit strip</SectionTitle>
          <p className="boe-units">
            <span className="boe-input">{bigText(dau.value)}</span> <s className="boe-cancel">users</s>/<s className="boe-cancel">day</s> ×{' '}
            <span className="boe-input">{bigText(actionsField.value)}</span> req/<s className="boe-cancel">user</s> ÷ <span className="boe-input">{days}</span> s/
            <s className="boe-cancel">day</s> = <b>{bigText(t.average.value)} req/s</b>
          </p>
          {round && (
            <Hint tone="muted" block>
              The round divisor is {pctText(1 - SECONDS_PER_DAY / t.secondsPerDay, 1)} off the {SECONDS_PER_DAY.toLocaleString('en-US')} it stands for; read the other way, the exact rate is {pctText(SHORTCUT_ERROR)} above it.
            </Hint>
          )}
          {(dau.error || actionsField.error) && <span className="boe-refusal" role="status">{dau.error ?? actionsField.error} Keeping the last valid number.</span>}
        </Box>
        <div className="boe-chips">
          <Provenance kind="illustrative">the peak factor and the read:write ratio are made-up defaults; real ones come from measuring</Provenance>
        </div>
        <Hint tone="muted" className="boe-note">Estimates are for order of magnitude; real capacity comes from measuring.</Hint>
      </div>
    </StageFrame>
  );
}
