import { SectionTitle } from '../components/Panel';
import { canonicalCodes, kraftSum } from '../core/huffman';
import { eigen2x2, powerIteration, svdSmall } from '../core/linalg';
import { DevKitSection as Section } from './DevKitSection';

/** Dev-only demo of the Tier 3 kit round, wave 3 to 4, agent G (#/dev/kit). */

const SYMMETRIC = [[2, 1], [1, 2]];
const ROTATION = [[0, -1], [1, 0]];
const SHEAR = [[1, 1], [0, 1]];
const STRIPES = [[1, 0, 1, 0], [1, 0, 1, 0], [1, 0, 1, 0], [1, 0, 1, 0]];
const RFC_LENGTHS = [3, 3, 3, 3, 3, 2, 4, 4];
const POWER_STEPS = 5;
const DIGITS = 3;

const show = (xs: readonly number[]) => `(${xs.map((x) => x.toFixed(DIGITS)).join(', ')})`;

function LinalgDemo() {
  const power = powerIteration(SYMMETRIC, { iters: POWER_STEPS, start: [1, 0] });
  const eigen = eigen2x2(SYMMETRIC);
  const rotation = eigen2x2(ROTATION);
  return (
    <>
      <p className="mono">power iteration on [[2,1],[1,2]] from (1, 0): {power.map((p) => show(p.v)).join(' → ')} · lambda {power.at(-1)!.lambda.toFixed(DIGITS)}</p>
      <p className="mono">eigen2x2 symmetric: {eigen?.kind === 'real' ? `${eigen.values.join(' and ')}, first vector ${show(eigen.vectors[0])}` : 'n/a'}</p>
      <p className="mono">eigen2x2 rotation: {rotation?.kind === 'complex' ? `${rotation.values[0].re} ± ${rotation.values[0].im}i` : 'n/a'} · shear: {eigen2x2(SHEAR) === null ? 'null (defective)' : 'found'}</p>
      <p className="mono">svdSmall of the 4 x 4 stripes image: singular values {show(svdSmall(STRIPES).s)}</p>
    </>
  );
}

function HuffmanDemo() {
  const codes = canonicalCodes(RFC_LENGTHS);
  return (
    <p className="mono">
      lengths {RFC_LENGTHS.join(',')} for A..H, Kraft sum {kraftSum(RFC_LENGTHS)} → {codes.map((c, i) => `${String.fromCharCode(65 + i)}=${c}`).join(' ')}
    </p>
  );
}

export function DevKitTier3g() {
  return (
    <>
      <SectionTitle>Tier 3 kit · wave 3 to 4 round, agent G</SectionTitle>
      <Section title="core/linalg · power iteration with every iterate, closed-form 2 x 2 eigen (real, complex, defective), small SVD">
        <LinalgDemo />
      </Section>
      <Section title="core/huffman · canonical codes from code lengths (the RFC 1951 example)">
        <HuffmanDemo />
      </Section>
    </>
  );
}
