import { useMemo, useState, type ReactNode } from 'react';
import { CodePanel } from '../../components/CodePanel';
import { SeedField } from '../../components/SeedField';
import { StageFrame } from '../../components/StageFrame';
import { ChipButton, ControlGroup, Legend, Provenance, ProvenanceRow, Segmented, Stat, Stats, Toggle } from '../../components/ui';
import { sig } from '../../core/format';
import { usePlayer } from '../../core/usePlayer';
import { BACK_STEPS, LAST_STEP, backwardFrames, chainLines } from './frames';
import { NetworkDiagram, type DiagramNode } from './NetworkDiagram';
import {
  BACKWARD_EPOCHS, BACKWARD_RATE, backwardOpening, EDGE_PARAM, PARAM_NAMES, XOR_CORNERS, backwardNet, chainRule, checkPanel, nudge, trainCorners,
} from './model';

const EPSILONS = [0.1, 0.01, 0.001, 0.00001] as const;
const EPSILON_LABELS = ['0.1', '0.01', '0.001', '1e-5'];
/** gradCheck passes below this relative error in float64 (the lesson's claim, checked in the tests). */
const PASS_BELOW = 1e-6;
const STEP_MS = 1400;


const percent = (x: number) => `${Math.round(x * 100)}%`;

export function BackwardScene({ picker }: { picker: ReactNode }) {
  const [seed, setSeed] = useState(backwardOpening().seed);
  const [example, setExample] = useState(backwardOpening().example);
  const [broken, setBroken] = useState(backwardOpening().broken);
  const [nudgeIndex, setNudgeIndex] = useState(backwardOpening().nudgeIndex);
  const [epsilon, setEpsilon] = useState<number>(backwardOpening().epsilon);

  const net = useMemo(() => backwardNet(seed, broken ? 'dropDerivative' : 'none'), [seed, broken]);
  const sample = XOR_CORNERS[example];
  const x = useMemo(() => [sample.x, sample.y] as const, [sample]);
  const chain = useMemo(() => chainRule(net, x, sample.label, broken), [net, x, sample.label, broken]);
  const frames = useMemo(() => backwardFrames(chain, broken), [chain, broken]);
  const player = usePlayer(frames, { interval: STEP_MS, autoplayOnChange: false });
  const step = player.frame.step;

  const panel = useMemo(() => checkPanel(net), [net]);
  const passes = panel.maxRelError < PASS_BELOW;
  const nudged = useMemo(() => nudge(net, x, sample.label, nudgeIndex, epsilon), [net, x, sample.label, nudgeIndex, epsilon]);
  const outcomes = useMemo(() => ({ correct: trainCorners(seed, 'none'), broken: trainCorners(seed, 'dropDerivative') }), [seed]);

  const g = chain.gradient;
  // Output edges show their gradient from step 2, hidden edges from step 4; until then they show the weight.
  const shown = EDGE_PARAM.map((p, k) => {
    const gradientKnown = step >= (k >= 4 ? 2 : 4);
    return { value: gradientKnown ? g[p] : net.params[p], gradientKnown };
  });
  // Each layer's edges share one scale, so a gradient is never drawn against a weight.
  const layerFull = (from: number, to: number) => Math.max(...shown.slice(from, to).map((s) => Math.abs(s.value)), Number.EPSILON);
  const edges = shown.map((s, k) => ({
    size: Math.abs(s.value),
    negative: s.value < 0,
    label: `${s.gradientKnown ? '∂' : 'w'} ${sig(s.value)}`,
    full: k >= 4 ? layerFull(4, 6) : layerFull(0, 4),
  }));
  const nodes: Record<'x1' | 'x2' | 'h1' | 'h2' | 'out', DiagramNode> = {
    x1: { main: sig(x[0]), tone: 'hi' },
    x2: { main: sig(x[1]), tone: 'hi' },
    h1: { main: sig(chain.h[0]), below: step >= 3 ? [`δ = ${sig(chain.deltaHidden[0])}`] : undefined, tone: step >= 3 ? 'violet' : 'info' },
    h2: { main: sig(chain.h[1]), below: step >= 3 ? [`δ = ${sig(chain.deltaHidden[1])}`] : undefined, tone: step >= 3 ? 'violet' : 'info' },
    out: { main: sig(chain.p), below: step >= 1 ? [`δ = ${sig(chain.deltaOut)}`] : undefined, tone: step >= 1 ? 'violet' : 'info' },
  };
  const lines = chainLines(chain, broken);

  return (
    <StageFrame
      height={520}
      player={player}
      stats={
        <Stats>
          <Stat label="Loss on this example" value={sig(chain.loss)} sub={`p = ${sig(chain.p)}, label ${chain.y}`} />
          <Stat
            label="gradCheck"
            value={passes ? 'passes' : 'fails'}
            color={passes ? 'var(--ok)' : 'var(--bad)'}
            sub={[`max relative error ${panel.maxRelError.toExponential(1)}`, `${panel.checked} of ${panel.parameters} weights checked, ${panel.skipped} skipped at kinks`]}
          />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--hi)', label: 'the example (inputs)', shape: 'dot' },
            { color: 'var(--info)', label: 'forward values', shape: 'dot' },
            { color: 'var(--violet)', label: 'error signals δ, right to left', shape: 'dot' },
            { color: 'var(--muted)', label: 'edge width is |weight| or |gradient|; dashed is negative', shape: 'line' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <ControlGroup label="Example" inline>
            {XOR_CORNERS.map((c, i) => (
              <ChipButton key={i} tone="hi" on={i === example} onClick={() => setExample(i)}>
                ({c.x}, {c.y}) class {c.label}
              </ChipButton>
            ))}
          </ControlGroup>
          <SeedField seed={seed} onSeed={setSeed} />
        </>,
        <>
          <Toggle
            label="Backward pass"
            value={broken}
            onChange={(next) => {
              player.queueNext({ play: false, from: player.index });
              setBroken(next);
            }}
            off="Correct"
            on="Break it: drop the slope f′"
          />
        </>,
      ]}
    >
      <div className="nn-stage stage-pad">
        <NetworkDiagram edges={edges} nodes={nodes} edgeTone={step >= 1 ? 'violet' : 'info'} ariaLabel={`The 2-2-1 network at step ${step + 1} of ${LAST_STEP + 1}: ${BACK_STEPS[step]}`} />
        <CodePanel title={`Chain rule on ${BACK_STEPS[step].toLowerCase()}`} lines={lines} active={step} gutter="arrow" />
        <div className="nn-panels">
          <section className="nn-panel" aria-label="Nudge and see">
            <h3 className="section-title">Nudge and see</h3>
            <ControlGroup label="Add ε to" className="nn-chips">
              {PARAM_NAMES.map((name, i) => (
                <ChipButton key={name} tone="violet" on={i === nudgeIndex} onClick={() => setNudgeIndex(i)}>{name}</ChipButton>
              ))}
            </ControlGroup>
            <Segmented label="ε" options={EPSILONS.map((v, i) => ({ value: v, label: EPSILON_LABELS[i] }))} value={epsilon} onChange={setEpsilon} />
            <p className="nn-readout">
              The loss really changes by <b>{sig(nudged.actualChange)}</b>; the backward pass predicts ∂L/∂w · ε = {sig(nudged.analytic)} × {sig(epsilon)} = <b>{sig(nudged.predictedChange)}</b>.
              Slope per unit weight: finite difference <b>{sig(nudged.finiteDifference)}</b> against the analytic <b>{sig(nudged.analytic)}</b>.
            </p>
          </section>
          <section className="nn-panel" aria-label="gradCheck and its cost">
            <h3 className="section-title">gradCheck and what it costs</h3>
            <p className="nn-readout">
              Numeric gradients (central differences, ε = 1e-5, all four corner examples): the largest relative error is <b>{panel.maxRelError.toExponential(1)}</b>. ReLU and max-pool kinks
              within ε are skipped ({panel.skipped} here; tanh has none).
            </p>
            <p className="nn-readout">
              The numeric way needs 2P = <b>{panel.numericForwardPasses}</b> forward passes for P = {panel.parameters} weights. Backprop needs <b>one forward and one backward</b> pass,
              however many weights there are: that is why training uses it.
            </p>
          </section>
          <section className="nn-panel" aria-label="Training with a wrong gradient">
            <h3 className="section-title">Train {BACKWARD_EPOCHS} epochs on the four corners (rate {BACKWARD_RATE})</h3>
            <table className="data-table nn-outcomes">
              <thead>
                <tr><th>backward pass</th><th>loss at the end</th><th>corners right</th></tr>
              </thead>
              <tbody>
                <tr><td>correct</td><td>{sig(outcomes.correct.endLoss)}</td><td>{percent(outcomes.correct.accuracy)}</td></tr>
                <tr><td>slope f′ dropped</td><td>{sig(outcomes.broken.endLoss)}</td><td>{percent(outcomes.broken.accuracy)}</td></tr>
              </tbody>
            </table>
            <p className="nn-readout">
              Both runs start at the same weights (seed {seed}, loss {sig(outcomes.correct.startLoss)}); only the hidden errors differ. ln 2 = {sig(Math.LN2)} is the loss of answering 0.5 everywhere.
            </p>
          </section>
        </div>
        <ProvenanceRow>
          <Provenance kind="toy" seed={seed}>a 2-2-1 network with {panel.parameters} weights, trained here on four points</Provenance>
          <Provenance kind="scripted">the &quot;break it&quot; option is a deliberate bug (core/nn fault), not a real framework failure</Provenance>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}
