import { SectionTitle } from '../components/Panel';
import { attention, createMlp, createSgd, gradCheck } from '../core/nn';
import { DevKitSection as Section } from './DevKitSection';

/** Dev-only demo of the Tier 3 kit round, wave 4 to 5, agent H (#/dev/kit). */

const XOR = { xs: [[0, 0], [0, 1], [1, 0], [1, 1]], ys: [0, 1, 1, 0] };
const XOR_SEED = 5;
const XOR_HIDDEN = 4;
const XOR_RATE = 0.5;
const XOR_EPOCHS = 2000;
const DIGITS = 3;

function NnDemo() {
  const net = createMlp({ inputs: 2, hidden: [XOR_HIDDEN], activation: 'tanh', seed: XOR_SEED });
  const check = gradCheck(net, XOR);
  const broken = gradCheck(createMlp({ inputs: 2, hidden: [XOR_HIDDEN], activation: 'tanh', seed: XOR_SEED, fault: 'dropDerivative' }), XOR);
  const sgd = createSgd({ learningRate: XOR_RATE });
  const first = sgd.step(net, XOR);
  for (let epoch = 1; epoch < XOR_EPOCHS; epoch++) sgd.step(net, XOR);
  const { weights } = attention([[1, 0]], [[1, 0], [0, 1]], [[1, 0], [0, 1]]);
  return (
    <>
      <p className="mono">XOR, 2-{XOR_HIDDEN}-1 tanh, seed {XOR_SEED}: loss {first.toFixed(DIGITS)} → {net.loss(XOR).toFixed(DIGITS)} after {XOR_EPOCHS} epochs</p>
      <p className="mono">gradCheck: max relative error {check.maxRelError.toExponential(1)} ({check.numericForwardPasses} forward passes numerically); dropped f&apos;: {broken.maxRelError.toExponential(1)}</p>
      <p className="mono">attention weights for q = (1, 0) over two keys: {weights[0].map((w) => w.toFixed(DIGITS)).join(', ')}</p>
    </>
  );
}

export function DevKitTier3h() {
  return (
    <>
      <SectionTitle>Tier 3 kit · wave 4 to 5 round, agent H</SectionTitle>
      <Section title="core/nn · a seeded MLP trained on XOR, gradCheck (right and deliberately wrong), attention weights">
        <NnDemo />
      </Section>
    </>
  );
}
