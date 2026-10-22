import { useState, type ReactNode } from 'react';
import { Bar } from '../../components/Bar';
import { Curve, Plot2D, Points, VLine } from '../../components/Plot2D';
import { StageFrame } from '../../components/StageFrame';
import { Hint, Legend, Provenance, ProvenanceRow, Slider, Stat, Stats } from '../../components/ui';
import { BoundedIntField } from '../../components/BoundedIntField';
import {
  BANDWIDTH, FLOPS, RIDGE_INTENSITY, RIDGE_TOKENS, WEIGHT_BYTES, decodeTiming, prefillTiming, runRequest, type Regime,
} from './cost';
import { OUTPUT_LIMITS, PROMPT_LIMITS, REQUEST_OPENING, requestCaption } from './request';
import { milliseconds, share } from './text';

const PLOT_POINTS = 60;

const regimeClass = (r: Regime) => (r === 'compute-bound' ? 'is-compute' : r === 'memory-bound' ? 'is-memory' : '');

function RegimeText({ regime }: { regime: Regime }) {
  return <span className={`llm-regime ${regimeClass(regime)}`}>{regime === 'balanced' ? 'balanced: the two terms are equal' : regime}</span>;
}

/** Scene 1: one request on the toy device, prefill then decode. */
export function RequestScene({ picker }: { picker: ReactNode }) {
  const [n, setN] = useState<number>(REQUEST_OPENING.prompt);
  const [m, setM] = useState<number>(REQUEST_OPENING.output);
  const run = runRequest(n, m);
  const firstDecode = decodeTiming(1, n + 1);
  const curve: [number, number][] = Array.from({ length: PLOT_POINTS }, (_, i) => {
    const x = Math.exp((Math.log(PROMPT_LIMITS.max) * i) / (PLOT_POINTS - 1));
    return [x, prefillTiming(x).seconds * 1000];
  });

  return (
    <StageFrame
      height={520}
      minWidth={420}
      intro={requestCaption(n, m)}
      introKey={`request|${n}|${m}`}
      stats={
        <Stats>
          <Stat label="TTFT" value={milliseconds(run.ttft)} color="var(--hi)" sub="the prefill, which also makes token 1" />
          <Stat label="TPOT" value={run.tpot === null ? 'no later tokens' : milliseconds(run.tpot)} color="var(--info)" sub="mean time per later token" />
          <Stat label="Total" value={milliseconds(run.totalSeconds)} sub={`${n.toLocaleString('en-US')} in, ${m.toLocaleString('en-US')} out`} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--hi)', label: 'prefill: the prompt processed together (compute-bound burst)', shape: 'square' },
            { color: 'var(--info)', label: 'decode: one token per step (memory-bound ticks)', shape: 'square' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <BoundedIntField label="Prompt tokens" value={n} min={PROMPT_LIMITS.min} max={PROMPT_LIMITS.max} onValue={setN} />
          <BoundedIntField label="Output tokens" value={m} min={OUTPUT_LIMITS.min} max={OUTPUT_LIMITS.max} onValue={setM} />
        </>,
        <>
          <Slider label="Prompt" value={n} min={PROMPT_LIMITS.min} max={PROMPT_LIMITS.max} format={(v) => `${v.toLocaleString('en-US')} tokens`} onChange={setN} />
          <Slider label="Output" value={m} min={OUTPUT_LIMITS.min} max={OUTPUT_LIMITS.max} format={(v) => `${v.toLocaleString('en-US')} tokens`} onChange={setM} />
        </>,
      ]}
    >
      <div className="llm-stage stage-pad">
        <div className="llm-wide">
          <div className="llm-bar-label"><span>Share of the tokens</span><b>prompt {share(run.promptShareOfTokens)}, output {share(1 - run.promptShareOfTokens)}</b></div>
          <Bar segments={[{ value: n, tone: 'hi' }, { value: m, tone: 'info' }]} max={n + m} height={14} ariaLabel={`Tokens: ${n} prompt, ${m} output`} />
          <div className="llm-bar-label"><span>Share of the time</span><b>prefill {share(run.promptShareOfTime)}, decode {share(1 - run.promptShareOfTime)}</b></div>
          <Bar segments={[{ value: run.prefill.seconds, tone: 'hi' }, { value: run.decodeSeconds, tone: 'info' }]} max={run.totalSeconds} height={14} ariaLabel={`Time: prefill ${milliseconds(run.prefill.seconds)}, decode ${milliseconds(run.decodeSeconds)}`} />
        </div>
        <div className="llm-row">
          <div className="llm-panel">
            <h3 className="section-title">Each phase: compute against memory</h3>
            <table className="llm-table">
              <thead><tr><th scope="col" /><th scope="col">compute</th><th scope="col">memory</th><th scope="col">takes</th></tr></thead>
              <tbody>
                <tr>
                  <th scope="row">prefill, {n.toLocaleString('en-US')} tokens</th>
                  <td>{milliseconds(run.prefill.computeSeconds)}</td><td>{milliseconds(run.prefill.memorySeconds)}</td><td>{milliseconds(run.prefill.seconds)}</td>
                </tr>
                <tr>
                  <th scope="row">first decode step, 1 sequence</th>
                  <td>{milliseconds(firstDecode.computeSeconds)}</td><td>{milliseconds(firstDecode.memorySeconds)}</td><td>{milliseconds(firstDecode.seconds)}</td>
                </tr>
              </tbody>
            </table>
            <p className="llm-note">Prefill: <RegimeText regime={run.prefill.regime} />. First decode step: <RegimeText regime={firstDecode.regime} />. The regime is whichever term is larger.</p>
            <Hint tone="muted">
              The ridge: the toy device does {RIDGE_INTENSITY} FLOPs per byte moved ({FLOPS.toExponential(0)} per second over {BANDWIDTH.toExponential(0)} bytes per second). One decode step does about 1 FLOP per byte of weights it reads, so it waits on memory;
              prefill reads the {(WEIGHT_BYTES / 1e9).toFixed(0)} GB of weights once for all its tokens and balances at {RIDGE_TOKENS} prompt tokens.
            </Hint>
          </div>
          <figure className="llm-figure">
            <figcaption>Prefill time against prompt length (log axis): flat while the weight read dominates, then rising with the tokens, bending at the ridge</figcaption>
            <Plot2D x={{ domain: [1, PROMPT_LIMITS.max], log: true, label: 'prompt tokens', ticks: 4 }} y={{ domain: [0, 170], label: 'ms', ticks: 4 }} width={320} height={190} ariaLabel={`Prefill time against prompt length: ${milliseconds(run.prefill.seconds)} at ${n} tokens`}>
              <Curve points={curve} tone="hi" />
              <VLine at={RIDGE_TOKENS} tone="ok" dashed label={`ridge ${RIDGE_TOKENS}`} />
              <Points data={[{ x: n, y: run.prefill.seconds * 1000, tone: 'hi' }]} r={5} />
            </Plot2D>
          </figure>
        </div>
        <Hint tone="muted" className="llm-note">
          Each decode step also reads the cache of every earlier token, so later steps are a little slower. This model leaves out the n-squared attention term of prefill (the attention-transformers lesson owns it) and treats the prompt as given tokens (tokenization-bpe).
        </Hint>
        <ProvenanceRow>
          <Provenance kind="illustrative">a toy device: {(WEIGHT_BYTES / 1e9).toFixed(0)} GB of weights, {BANDWIDTH.toExponential(0)} bytes per second, {FLOPS.toExponential(0)} FLOPs per second are round numbers for the page, not any product&apos;s</Provenance>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}
