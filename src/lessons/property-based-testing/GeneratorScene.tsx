import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { CodePanel } from '../../components/CodePanel';
import { StageFrame } from '../../components/StageFrame';
import { Hint, Legend, Provenance, Segmented, Slider, Stat, Stats } from '../../components/ui';
import { useSetCaption } from '../../core/caption';
import { generatorCaption } from './captions';
import { formatProbability } from './config';
import { DEFAULT_CASES, MAX_LENGTH, OPENING_GENERATOR, OPENING_LENGTH, RANGES, repeatProbability, repeatWithin, type GenConfig, type RangeId } from './generator';
import { forAll } from './runner';
import { bugOf } from './sorts';
import { SeedField } from '../../components/SeedField';

const MIN_LENGTH = 2;

export function GeneratorScene({ picker }: { picker: ReactNode }) {
  const [config, setConfig] = useState<GenConfig>(OPENING_GENERATOR);
  const setCaption = useSetCaption();
  const dedupe = bugOf('dedupe');
  const run = useMemo(() => forAll(dedupe.fn, ['sameLength'], config), [dedupe, config]);
  const first = run.failure ? run.failure.k : null;

  useEffect(() => {
    setCaption(generatorCaption(config, first), { quiet: true });
  }, [setCaption, config, first]);

  return (
    <StageFrame
      height={440}
      stats={
        <Stats>
          <Stat label="Chance of a repeat" value={formatProbability(repeatProbability(config))} sub="in one case, from the formula" />
          <Stat label={`In ${DEFAULT_CASES} cases`} value={formatProbability(repeatWithin(config, DEFAULT_CASES))} sub="at least one repeat" />
          <Stat label="Seeded run" value={first === null ? `no failure in ${DEFAULT_CASES}` : `failed at case ${first}`} color={first === null ? 'var(--orange)' : 'var(--bad)'} sub={`seed ${config.seed}`} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--bad)', label: 'a failing case', shape: 'square' },
            { color: 'var(--orange)', label: 'no failure found: not the same as correct', shape: 'square' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <Segmented
            label="Values"
            value={config.range}
            onChange={(range: RangeId) => setConfig({ ...config, range })}
            options={RANGES.map((r) => ({ value: r.id, label: r.label }))}
          />
          <Slider
            label="Array length"
            value={config.fixedLength ?? OPENING_LENGTH}
            min={MIN_LENGTH}
            max={MAX_LENGTH}
            onChange={(n) => setConfig({ ...config, fixedLength: n, maxLength: n })}
            format={(v) => `${v} values`}
          />
          <SeedField seed={config.seed} onSeed={(seed) => setConfig({ ...config, seed })} />
        </>,
      ]}
    >
      <div className="pbt stage-pad">
        <div className="pbt-panels">
          <CodePanel title="The function: dedupes while sorting" lines={dedupe.source} stateOf={(i) => (first !== null && dedupe.badLine === i ? 'bad' : 'idle')} />
          <CodePanel title="The only property ticked" lines={['const sameLength = (xs, out) => out.length === xs.length;']} stateOf={() => 'idle'} />
        </div>
        <p className="pbt-note">
          This bug fails only when an input repeats a value. How often a random input does is a birthday problem: the chance that {config.fixedLength ?? OPENING_LENGTH} draws from this range are not all different.
        </p>
        <div className="pbt-notes">
          <Provenance kind="real" seed={config.seed}>real JavaScript runs on every case</Provenance>
          <Provenance kind="toy">the chance comes from an exact formula over the generator; the runner is a toy, not fast-check</Provenance>
          <Hint block>The same seed always gives the same cases, so the run beside the formula is reproducible.</Hint>
        </div>
      </div>
    </StageFrame>
  );
}
