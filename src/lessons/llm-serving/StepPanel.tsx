import { useState } from 'react';
import { Slider } from '../../components/ui';
import { MAX_SEQ, stepShape } from './cost';
import { milliseconds } from './text';

/** The step shape the key ideas quote, as the opening state: 64 sequences of 1,000 tokens each. */
export const STEP_OPENING = { batch: 64, context: 1000 } as const;
export const STEP_BATCH_LIMITS = { min: 1, max: 64 } as const;

const times = (x: number) => `${x.toFixed(2)} times`;

/** One decode step at a chosen batch size and context, against a batch of 1: step time, tokens per second and the two ratios. */
export function StepPanel() {
  const [batch, setBatch] = useState<number>(STEP_OPENING.batch);
  const [context, setContext] = useState<number>(STEP_OPENING.context);
  const shape = stepShape(batch, context);

  return (
    <div className="llm-panel">
      <h3 className="section-title">One decode step at a batch size</h3>
      <Slider label="Sequences in the step" value={batch} min={STEP_BATCH_LIMITS.min} max={STEP_BATCH_LIMITS.max} onChange={setBatch} />
      <Slider label="Context per sequence" value={context} min={0} max={MAX_SEQ} step={100} format={(v) => `${v.toLocaleString('en-US')} tokens`} onChange={setContext} />
      <table className="llm-table">
        <thead><tr><th scope="col" /><th scope="col">1 sequence</th><th scope="col">{batch} {batch === 1 ? 'sequence' : 'sequences'}</th></tr></thead>
        <tbody>
          <tr><th scope="row">compute term</th><td>{milliseconds(shape.single.computeSeconds)}</td><td>{milliseconds(shape.step.computeSeconds)}</td></tr>
          <tr><th scope="row">memory term</th><td>{milliseconds(shape.single.memorySeconds)}</td><td>{milliseconds(shape.step.memorySeconds)}</td></tr>
          <tr><th scope="row">step takes</th><td>{milliseconds(shape.single.seconds)}</td><td>{milliseconds(shape.step.seconds)}</td></tr>
          <tr><th scope="row">tokens per second</th><td>{Math.round(shape.singleTokensPerSecond).toLocaleString('en-US')}</td><td>{Math.round(shape.tokensPerSecond).toLocaleString('en-US')}</td></tr>
        </tbody>
      </table>
      <p className="llm-note">
        The step takes {times(shape.timeRatio)} as long as one sequence&apos;s step and gives {times(shape.throughputRatio)} the tokens per second; the larger term is the {shape.step.regime === 'balanced' ? 'tie (the two terms are equal)' : shape.step.regime === 'compute-bound' ? 'compute term' : 'memory term'}.
      </p>
    </div>
  );
}
