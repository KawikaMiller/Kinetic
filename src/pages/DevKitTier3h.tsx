import { useState } from 'react';
import { BinaryTreeView, TREE_NODE_RADIUS } from '../components/BinaryTreeView';
import { SectionTitle, Tray } from '../components/Panel';
import { Button } from '../components/ui';
import { buildAvl, checkAvl, heightOf } from '../core/avl';
import { binaryEntropy, orderZeroBitsPerChar } from '../core/entropy';
import { parseKeyList } from '../core/keyInput';
import { initPlusPlus, kmeans } from '../core/kmeans';
import { attention, createMlp, createSgd, gradCheck } from '../core/nn';
import { parseRows } from '../core/parse';
import { mulberry32 } from '../core/random';
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

const KMEANS_POINTS = [[0, 0], [0.4, 0.2], [0.1, 0.6], [6, 6], [6.3, 5.8], [5.7, 6.4], [0, 6], [0.3, 6.2]];
const KMEANS_K = 3;
const KMEANS_SEED = 2;

function KmeansDemo() {
  const run = kmeans(KMEANS_POINTS, initPlusPlus(KMEANS_POINTS, KMEANS_K, mulberry32(KMEANS_SEED)));
  return (
    <p className="mono">
      {KMEANS_POINTS.length} points, k = {KMEANS_K}, k-means++ seed {KMEANS_SEED}: {run.iterations} passes, {run.computations} distance computations, cells {run.assign.join('')}
    </p>
  );
}

const ENTROPY_COIN = 0.1;
const ENTROPY_TEXT = 'mississippi';

function EntropyDemo() {
  return (
    <p className="mono">
      H(coin, p = {ENTROPY_COIN}) = {binaryEntropy(ENTROPY_COIN).toFixed(DIGITS)} bits · order-0 entropy of &quot;{ENTROPY_TEXT}&quot; = {orderZeroBitsPerChar(ENTROPY_TEXT).toFixed(DIGITS)} bits per character
    </p>
  );
}

const TREE_KEYS = '30 10 20 40 50 25 5';
const TREE_TOP = 30;
const TREE_MAX_GAP = 48;

function TreeDemo() {
  const parsed = parseKeyList(TREE_KEYS);
  if (!parsed.ok) return <p className="mono">{parsed.error}</p>;
  const built = buildAvl(parsed.value);
  return (
    <>
      <p className="mono">
        keys {TREE_KEYS} → AVL of height {heightOf(built.tree)}, {built.rotations} rotations, {checkAvl(built.tree).length === 0 ? 'every rule holds' : 'broken'} · typed &quot;7 7&quot;: {String(parseKeyList('7 7').ok === false)}
      </p>
      <BinaryTreeView
        tree={built.tree}
        levels={heightOf(built.tree)}
        top={TREE_TOP}
        maxGap={TREE_MAX_GAP}
        className="devkit-tree"
        renderNode={(id) => (
          <>
            <circle r={TREE_NODE_RADIUS} fill="none" stroke="currentColor" />
            <text y={3.5} textAnchor="middle" fill="currentColor">{id}</text>
          </>
        )}
        ariaLabel="An AVL tree built from the demo keys"
      />
    </>
  );
}

const TRAY_ITEMS = ['a', 'b', 'c'];

function TrayDemo() {
  const [shown, setShown] = useState(true);
  return (
    <div className="devkit-row">
      <Button onClick={() => setShown((s) => !s)}>{shown ? 'Hide every item' : 'Show the items'}</Button>
      <Tray label="Items" labelWeight="regular" empty="nothing to show: every entry is false">
        {TRAY_ITEMS.map((x) => shown && <span key={x} className="mono">{x} </span>)}
      </Tray>
    </div>
  );
}

const CARD_ROWS = [
  { name: 'alpha', verdict: 'halts', why: 'the loop counter reaches its bound' },
  { name: 'beta', verdict: 'loops', why: 'the counter never changes' },
];

function CardsDemo() {
  return (
    <table className="table-cards">
      <thead>
        <tr><th>Program</th><th>Verdict</th><th>Why</th></tr>
      </thead>
      <tbody>
        {CARD_ROWS.map((r) => (
          <tr key={r.name}>
            <th scope="row">{r.name}</th>
            <td data-label="Verdict">{r.verdict}</td>
            <td data-label="Why">{r.why}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

const ROWS_NOUN = { one: 'instruction', many: 'instructions' };
const ROWS_TEXT = 'PUSH 1\nPUSH 2\nADD';
const ROWS_LIMIT = 2;

function RowsDemo() {
  const read = parseRows(ROWS_TEXT, { maxRows: ROWS_LIMIT, maxLineChars: 30, noun: ROWS_NOUN, row: (text) => ({ ok: true, value: text }) });
  return <p className="mono">{read.ok ? `${read.rows.length} rows` : read.error}</p>;
}

export function DevKitTier3h() {
  return (
    <>
      <SectionTitle>Tier 3 kit · wave 4 to 5 round, agent H</SectionTitle>
      <Section title="core/nn · a seeded MLP trained on XOR, gradCheck (right and deliberately wrong), attention weights">
        <NnDemo />
      </Section>
      <Section title="core/kmeans · one Lloyd loop for clustering-kmeans and vector-search: passes, distance computations, cells">
        <KmeansDemo />
      </Section>
      <Section title="core/entropy · entropy of a distribution and the order-0 entropy of a text, shared by entropy-information and lz-compression">
        <EntropyDemo />
      </Section>
      <Section title="core/avl, core/keyInput, BinaryTreeView · the one AVL model, typed key lists, the binary-tree drawing both tree lessons share">
        <TreeDemo />
      </Section>
      <Section title="Tray · an array of all-false children shows the empty text">
        <TrayDemo />
      </Section>
      <Section title="table-cards (kit.css) · under 600px each row becomes a card labelled from data-label">
        <CardsDemo />
      </Section>
      <Section title="parseRows · a caller-supplied noun in the over-limit message">
        <RowsDemo />
      </Section>
    </>
  );
}
