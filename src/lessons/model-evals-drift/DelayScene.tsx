import { useMemo, useState, type ReactNode } from 'react';
import { SeedField } from '../../components/SeedField';
import { StageFrame } from '../../components/StageFrame';
import { Legend, Provenance, ProvenanceRow, Segmented, Slider, Stat, Stats } from '../../components/ui';
import { DriftPlots } from './DriftPlots';
import { KIND_LABEL, delayCaption } from './captions';
import { delaySetting } from './facts';
import { DELAY_DEFAULT, DELAY_MAX, DELAY_SHIFT } from './settings';
import { alarms, simulate } from './stream';
import type { Kind } from './world';

const KINDS = (Object.keys(KIND_LABEL) as Kind[]).map((k) => ({ value: k, label: KIND_LABEL[k] }));

export function DelayScene({ picker }: { picker: ReactNode }) {
  const [kind, setKind] = useState<Kind>(DELAY_DEFAULT.kind);
  const [delay, setDelay] = useState<number>(DELAY_DEFAULT.delay);
  const [seed, setSeed] = useState<number>(DELAY_DEFAULT.seed);
  const setting = useMemo(() => delaySetting({ kind, labelDelay: delay, seed }), [kind, delay, seed]);
  const stream = useMemo(() => simulate(setting), [setting]);
  const a = alarms(stream, delay, DELAY_SHIFT.day);
  const caption = delayCaption(kind, delay, DELAY_SHIFT.day, a);

  return (
    <StageFrame
      height={470}
      intro={caption}
      introKey={caption}
      stats={
        <Stats>
          <Stat label="Input monitors" value={a.input === null ? 'silent' : `day ${a.input}`} color={a.input === null ? 'var(--ok)' : 'var(--bad)'} sub="no labels needed" />
          <Stat label="Accuracy alarm" value={a.accuracy === null ? 'not fired' : `day ${a.accuracy}`} color={a.accuracy === null ? 'var(--ok)' : 'var(--orange)'} sub={`labels arrive ${delay} days late`} />
          <Stat label="Damage began" value={`day ${DELAY_SHIFT.day}`} color="var(--hi)" sub={`a ${DELAY_SHIFT.sizePct}% shift`} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--hi)', label: 'the day the damage began', shape: 'line' },
            { color: 'var(--bad)', label: 'an input alert', shape: 'line' },
            { color: 'var(--orange)', label: 'the accuracy alarm, late by the label delay', shape: 'line' },
            { color: 'var(--violet)', label: 'monitor readings', shape: 'line' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <Segmented label="Kind of shift" value={kind} onChange={setKind} options={KINDS} />
        </>,
        <>
          <Slider label="Label delay" value={delay} min={0} max={DELAY_MAX} onChange={setDelay} format={(v) => `${v} days`} />
          <SeedField seed={seed} onSeed={setSeed} />
        </>,
      ]}
    >
      <div className="med-stage stage-pad">
        <DriftPlots stream={stream} marks={{ shiftDay: DELAY_SHIFT.day, alarms: a }} />
        <ProvenanceRow>
          <Provenance kind="simulated" seed={seed}>label delay and shifts are simulated; the shift starts on day {DELAY_SHIFT.day}</Provenance>
          <Provenance kind="toy">toy logistic regression on seeded blobs</Provenance>
          <Provenance kind="illustrative">the 80% accuracy alarm line is illustrative</Provenance>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}
