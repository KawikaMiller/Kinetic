import { useMemo, useState, type ReactNode } from 'react';
import { SeedField } from '../../components/SeedField';
import { StageFrame } from '../../components/StageFrame';
import { Hint, Legend, Provenance, ProvenanceRow, Segmented, Slider, Stat, Stats } from '../../components/ui';
import { DriftPlots, DayMeters } from './DriftPlots';
import { KIND_LABEL, driftCaption, pct1 } from './captions';
import { accuracySplit, driftSetting } from './facts';
import { PINNED_SEEDS } from './pinned';
import { DETECT_WITHIN_DAYS } from './seedStats';
import { DAY_FIRST, DAY_LAST, DRIFT_DEFAULT, SIZE_STEPS } from './settings';
import { alarms, shiftDayOf, simulate } from './stream';
import type { Kind } from './world';

const KINDS = (Object.keys(KIND_LABEL) as Kind[]).map((k) => ({ value: k, label: KIND_LABEL[k] }));

export function DriftScene({ picker }: { picker: ReactNode }) {
  const [kind, setKind] = useState<Kind>(DRIFT_DEFAULT.kind);
  const [day, setDay] = useState<number>(DRIFT_DEFAULT.day);
  const [sizePct, setSizePct] = useState<number>(DRIFT_DEFAULT.sizePct);
  const [seed, setSeed] = useState<number>(DRIFT_DEFAULT.seed);
  const [shownDay, setShownDay] = useState<number>(DRIFT_DEFAULT.shownDay);
  const setting = useMemo(() => driftSetting({ kind, day, sizePct, seed }), [kind, day, sizePct, seed]);
  const stream = useMemo(() => simulate(setting), [setting]);
  const a = alarms(stream, setting.labelDelay, shiftDayOf(setting));
  const { before, after } = accuracySplit(stream, day);
  const caption = driftCaption(kind, day, sizePct, before, after, a);

  return (
    <StageFrame
      height={470}
      intro={caption}
      introKey={caption}
      stats={
        <Stats>
          <Stat label="Mean accuracy" value={`${pct1(before)} to ${pct1(after)}`} color={sizePct > 0 ? 'var(--bad)' : 'var(--ok)'} sub={`before and from day ${day} on`} />
          <Stat label="Input alert" value={a.input === null ? 'never' : `day ${a.input}`} color={a.input === null ? 'var(--ok)' : 'var(--bad)'} sub="PSI above 0.25 or KS above its critical value" />
          <Stat label="Accuracy alarm" value={a.accuracy === null ? 'never' : `day ${a.accuracy}`} color={a.accuracy === null ? 'var(--ok)' : 'var(--bad)'} sub="labels assumed to arrive the same day" />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--hi)', label: 'the shift day', shape: 'line' },
            { color: 'var(--violet)', label: 'current batch against the baseline', shape: 'line' },
            { color: 'var(--bad)', label: 'dashed: the first input alert', shape: 'line' },
            { color: 'var(--orange)', label: 'dashed: the accuracy alarm', shape: 'line' },
            { color: 'var(--ok)', label: 'a healthy accuracy day', shape: 'dot' },
            { color: 'var(--bad)', label: 'an alert or an accuracy drop', shape: 'dot' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <Segmented label="Kind of shift" value={kind} onChange={setKind} options={KINDS} />
        </>,
        <>
          <Slider label="Shift day" value={day} min={DAY_FIRST} max={DAY_LAST} onChange={setDay} />
          <Slider label="Shift size" value={sizePct} min={SIZE_STEPS[0]} max={SIZE_STEPS.at(-1)!} step={20} onChange={setSizePct} format={(v) => `${v}%`} />
          <SeedField seed={seed} onSeed={setSeed} />
        </>,
        <Slider key="day" label="Look at day" value={shownDay} min={1} max={40} onChange={setShownDay} />,
      ]}
    >
      <div className="med-stage stage-pad">
        <DriftPlots stream={stream} marks={{ shiftDay: sizePct > 0 ? day : null, alarms: a }} />
        <DayMeters stream={stream} day={shownDay} />
        <Hint tone="muted" block>
          Seeds matter. Over {PINNED_SEEDS.streams} seeds, an 80% covariate shift sets off an input monitor within {DETECT_WITHIN_DAYS} days on {PINNED_SEEDS.covariateDetected} of them; a 60% concept drift leaves the inputs exactly as they would be with no drift, and still {PINNED_SEEDS.conceptInputAlert} streams raise an input alert after the shift day, by ordinary false alarm (see False alarms). {PINNED_SEEDS.falseBeforeShift} of {PINNED_SEEDS.streams} streams raise one before the shift too. Accuracy falls under covariate shift because the rule is unchanged but the points now sit where it is least certain, so any model's accuracy falls; real covariate shift can also hurt a model that never saw the new region. Label shift, where the class mix itself changes, is a third kind not modelled here.
        </Hint>
        <ProvenanceRow>
          <Provenance kind="toy">toy logistic regression on seeded blobs, about 90% accurate before the shift</Provenance>
          <Provenance kind="simulated" seed={seed}>shifts and daily batches are simulated</Provenance>
          <Provenance kind="from-memory">PSI bands of 0.1 and 0.25 are a rule of thumb, from memory, not a standard</Provenance>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}
