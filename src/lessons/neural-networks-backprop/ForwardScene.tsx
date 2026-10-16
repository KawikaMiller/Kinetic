import { useMemo, useState, type ReactNode } from 'react';
import { Curve, Plot2D, Points } from '../../components/Plot2D';
import { SeedField } from '../../components/SeedField';
import { StageFrame } from '../../components/StageFrame';
import { ChipButton, Legend, Provenance, ProvenanceRow, Segmented, Slider, Stat, Stats } from '../../components/ui';
import { sig } from '../../core/format';
import { forwardCaption } from './captions';
import { NetworkDiagram, type DiagramNode } from './NetworkDiagram';
import {
  CLASS_TONE, CORNERS, EDGE_PARAM, FORWARD_CUT, INPUT_RANGE, cornerLabel, cornerReport, forwardArithmetic, forwardNet,
  forwardNumbers, forwardOpening, hiddenCut, hiddenDomain, type ForwardPreset,
} from './model';

const PRESETS: { value: ForwardPreset; label: string }[] = [
  { value: 'xor', label: 'Hand-built XOR network' },
  { value: 'random', label: 'Seeded random network' },
];
const MINI_PLOT_WIDTH = 250;

/** The input as a tidy pair: 1 reads "1", -0.5 reads "−0.5". */
const at = (x: readonly [number, number]) => `(${sig(x[0])}, ${sig(x[1])})`;


export function ForwardScene({ picker }: { picker: ReactNode }) {
  const [preset, setPreset] = useState<ForwardPreset>(forwardOpening().preset);
  const [seed, setSeed] = useState(forwardOpening().seed);
  const [x, setX] = useState<[number, number]>(forwardOpening().x);

  const net = useMemo(() => forwardNet(preset, seed), [preset, seed]);
  const numbers = forwardNumbers(net, x);
  const arithmetic = forwardArithmetic(net.params, x);
  const report = useMemo(() => cornerReport(net), [net]);
  const domain = useMemo(() => hiddenDomain(net), [net]);
  const cut = hiddenCut(net);

  const nodes: Record<'x1' | 'x2' | 'h1' | 'h2' | 'out', DiagramNode> = {
    x1: { main: sig(x[0]), tone: 'hi' },
    x2: { main: sig(x[1]), tone: 'hi' },
    h1: { main: sig(arithmetic.hidden[0].h), below: [`z = ${sig(arithmetic.hidden[0].z)}`, `b = ${sig(arithmetic.hidden[0].bias)}`], tone: 'info' },
    h2: { main: sig(arithmetic.hidden[1].h), below: [`z = ${sig(arithmetic.hidden[1].z)}`, `b = ${sig(arithmetic.hidden[1].bias)}`], tone: 'info' },
    out: { main: sig(arithmetic.out.value), below: [`b = ${sig(arithmetic.out.bias)}`], tone: 'info' },
  };
  const edges = EDGE_PARAM.map((p) => ({ size: Math.abs(net.params[p]), negative: net.params[p] < 0, label: sig(net.params[p]) }));
  const current = [{ x: x[0], y: x[1], tone: 'hi' as const, hollow: true }];
  const hiddenNow = [{ x: numbers.h[0], y: numbers.h[1], tone: 'hi' as const, hollow: true }];

  return (
    <StageFrame
      height={460}
      intro={forwardCaption({ numbers, label: cornerLabel(x) })}
      introKey={[net, x]}
      stats={
        <Stats>
          <Stat label="Output" value={sig(numbers.out)} sub={`reads at ${FORWARD_CUT}`} />
          <Stat label="Corners right" value={`${report.right} of ${CORNERS.length}`} sub="out above 0.5 reads as class 1" />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--hi)', label: 'the input being propagated', shape: 'dot' },
            { color: 'var(--info)', label: 'forward activations', shape: 'dot' },
            { color: 'var(--muted)', label: 'edge width is |weight|; dashed is negative', shape: 'line' },
            { color: `var(--${CLASS_TONE[0]})`, label: 'class 0', shape: 'dot' },
            { color: `var(--${CLASS_TONE[1]})`, label: 'class 1', shape: 'dot' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <Segmented label="Weights" options={PRESETS} value={preset} onChange={setPreset} />
          {preset === 'random' && <SeedField seed={seed} onSeed={setSeed} />}
        </>,
        <>
          <Slider label="x1" value={x[0]} {...INPUT_RANGE} format={sig} onChange={(v) => setX([v, x[1]])} />
          <Slider label="x2" value={x[1]} {...INPUT_RANGE} format={sig} onChange={(v) => setX([x[0], v])} />
          {CORNERS.map((c) => (
            <ChipButton key={`${c.x}${c.y}`} tone="hi" on={x[0] === c.x && x[1] === c.y} onClick={() => setX([c.x, c.y])}>
              corner {at([c.x, c.y])}
            </ChipButton>
          ))}
        </>,
      ]}
    >
      <div className="nn-stage stage-pad">
        <div className="nn-forward">
          <NetworkDiagram edges={edges} nodes={nodes} edgeTone="info" ariaLabel={`A 2-2-1 network, input ${at(x)}, output ${sig(numbers.out)}`} />
          <ol className="nn-arith" aria-label="The arithmetic, line by line">
            {arithmetic.hidden.map((u, j) => (
              <li key={j}>
                z{j + 1} = {sig(u.terms[0])} + {sig(u.terms[1])} + {sig(u.bias)} = <b>{sig(u.z)}</b> then ReLU: h{j + 1} = <b>{sig(u.h)}</b>
              </li>
            ))}
            <li>
              output = {sig(arithmetic.out.terms[0])} + {sig(arithmetic.out.terms[1])} + {sig(arithmetic.out.bias)} = <b>{sig(arithmetic.out.value)}</b>
            </li>
          </ol>
        </div>
        <div className="nn-spaces">
          <figure className="nn-figure">
            <figcaption>Input space: the four corners</figcaption>
            <Plot2D x={{ domain: [INPUT_RANGE.min, INPUT_RANGE.max], label: 'x1', ticks: 3 }} y={{ domain: [INPUT_RANGE.min, INPUT_RANGE.max], label: 'x2', ticks: 3 }} width={MINI_PLOT_WIDTH} aspect="equal" ariaLabel="Input space with the four XOR corners; no straight line puts both class 1 corners on one side">
              <Points data={CORNERS.map((c) => ({ x: c.x, y: c.y, tone: CLASS_TONE[c.label] }))} r={6} />
              <Points data={current} r={9} />
            </Plot2D>
          </figure>
          <figure className="nn-figure">
            <figcaption>Hidden space: the same corners after the hidden layer</figcaption>
            <Plot2D x={{ domain, label: 'h1', ticks: 3 }} y={{ domain, label: 'h2', ticks: 3 }} width={MINI_PLOT_WIDTH} aspect="equal" ariaLabel={`Hidden space: the four corners after the hidden layer, and the line where the output reads ${FORWARD_CUT}`}>
              {cut && <Curve fn={cut} tone="muted" dashed />}
              <Points data={CORNERS.map((c) => ({ x: net.trace([c.x, c.y]).a[1][0], y: net.trace([c.x, c.y]).a[1][1], tone: CLASS_TONE[c.label] }))} r={6} />
              <Points data={hiddenNow} r={9} />
            </Plot2D>
          </figure>
        </div>
        <table className="data-table nn-corners">
          <caption className="sr-only">What the network says on each corner</caption>
          <thead>
            <tr><th>input</th><th>XOR says</th><th>output</th><th>reads as</th></tr>
          </thead>
          <tbody>
            {report.rows.map((r) => (
              <tr key={`${r.corner.x}${r.corner.y}`}>
                <td>{at([r.corner.x, r.corner.y])}</td>
                <td>{r.corner.label}</td>
                <td>{sig(r.out)}</td>
                <td>{r.reading} {r.right ? '(right)' : '(wrong)'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <ProvenanceRow>
          <Provenance kind="toy">{preset === 'xor' ? 'hand-built weights from a textbook construction (Goodfellow, Bengio and Courville, Deep Learning, ch. 6: verify)' : 'a seeded random 2-2-1 network, not trained'}</Provenance>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}
