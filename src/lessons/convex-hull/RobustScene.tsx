import { useMemo, useState, type ReactNode } from 'react';
import { StageFrame } from '../../components/StageFrame';
import { Button, ClaimLabel, Hint, Provenance, ProvenanceRow, Segmented, Stat, Stats } from '../../components/ui';
import { orientDouble, orientExact } from './robust';
import { INTEGER_TRIPLE, MISMATCHES_SHOWN, SEARCH_CANDIDATES, SEARCH_SEED, SEG_FROM, SEG_TO, hullDemo, searchMismatches } from './robust';
import { pt } from './text';

const DIGITS = 17;
const signWord = (s: number) => (s > 0 ? 'left turn (positive)' : s < 0 ? 'right turn (negative)' : 'collinear (zero)');
const coord = (v: number) => v.toPrecision(DIGITS);

/** Scene 4: three points too close to draw, and what the same cross product says in doubles and in exact arithmetic. */
export function RobustScene({ picker }: { picker: ReactNode }) {
  const search = useMemo(() => searchMismatches(), []);
  const { found } = search;
  const [which, setWhich] = useState(0);
  const [integers, setIntegers] = useState(false);
  const [ran, setRan] = useState(false);
  const m = found[Math.min(which, found.length - 1)];
  const triple = integers ? INTEGER_TRIPLE : ([m.point, SEG_FROM, SEG_TO] as const);
  const [a, b, c] = triple;
  const double = orientDouble(a, b, c);
  const exact = orientExact(a, b, c);
  const demo = useMemo(() => (integers ? null : hullDemo(m)), [integers, m]);
  const lost = demo ? demo.withExact.filter((p) => !demo.withDouble.some((q) => q.x === p.x && q.y === p.y)) : [];
  const agree = Math.sign(double) === exact.sign;

  const intro = integers ? (
    <>With whole-number coordinates the products stay below 2^53, so the double result {double} and the exact result agree: both say {signWord(exact.sign)}.</>
  ) : (
    <>
      The point is {coord(a.x)}, {coord(a.y)}: {m.i} and {m.j} steps of 2^-53 above 0.5. In doubles the orientation is {double}, {signWord(Math.sign(double))}; computed exactly it is {exact.sign}, a {signWord(exact.sign)}.
    </>
  );

  return (
    <StageFrame
      height={380}
      intro={intro}
      introKey={[integers, which, double, exact.sign]}
      stats={
        <Stats>
          <Stat label="In doubles" value={double} color={agree ? undefined : 'var(--bad)'} sub={signWord(Math.sign(double))} />
          <Stat label="Exactly (BigInt)" value={exact.sign > 0 ? '+' : exact.sign < 0 ? '-' : '0'} color="var(--ok)" sub={signWord(exact.sign)} />
          <Stat
            label="Found by search"
            value={integers ? '–' : found.length}
            sub={integers ? 'the search is for the doubles case' : `seed ${SEARCH_SEED}: ${MISMATCHES_SHOWN} found within the first ${search.tried} random lattice points (up to ${SEARCH_CANDIDATES.toLocaleString('en-US')} allowed), so a wrong sign is common here`} />
        </Stats>
      }
      controls={[
        <>
          {picker}
          <Segmented label="Case" value={integers ? 'int' : 'lattice'} onChange={(v) => { setIntegers(v === 'int'); setRan(false); }} options={[{ value: 'lattice', label: 'Doubles near 0.5' }, { value: 'int', label: 'Whole numbers' }]} />
          {!integers && (
            <Segmented label="Mismatch" value={which} onChange={(v) => { setWhich(v); setRan(false); }} options={found.map((_, i) => ({ value: i, label: `#${i + 1}` }))} />
          )}
          {!integers && <Button variant="primary" onClick={() => setRan(true)}>Run a hull on these</Button>}
        </>,
      ]}
    >
      <div className="ch-stage stage-pad">
        <table className="ch-table" aria-label="Stored coordinates and the two orientation results">
          <caption>Three points: p (a point of the lattice), q = {pt(SEG_FROM)} and r = {pt(SEG_TO)}. The numbers below are the doubles actually stored.</caption>
          <tbody>
            <tr><th scope="row">p</th><td>({coord(a.x)}, {coord(a.y)})</td></tr>
            <tr><th scope="row">q</th><td>({b.x}, {b.y})</td></tr>
            <tr><th scope="row">r</th><td>({c.x}, {c.y})</td></tr>
            <tr><th scope="row">Orientation in doubles</th><td><span className={agree ? '' : 'ch-bad'}>{double}</span> {signWord(Math.sign(double))}</td></tr>
            <tr><th scope="row">Orientation, exact</th><td><span className="ch-ok">{exact.sign > 0 ? '+' : exact.sign < 0 ? '-' : ''}{(exact.units < 0n ? -exact.units : exact.units).toString()} x 2^{exact.exponent}</span> {signWord(exact.sign)}</td></tr>
          </tbody>
        </table>
        {ran && demo && (
          <p className="ch-note" role="status">
            Andrew's chain with the double test returns {demo.withDouble.length} {demo.withDouble.length === 1 ? 'point' : 'points'}: {demo.withDouble.map(pt).join(', ')}. With the exact test it returns {demo.withExact.length}: {demo.withExact.map(pt).join(', ')}.
            {lost.length ? <> The double test said "collinear" and popped {lost.map(pt).join(', ')}, a point that is a real hull vertex.</> : null}
          </p>
        )}
        {!integers && (
          <p className="ch-note">
            Why the double test fails: p differs from q and r by amounts near 11.5 and 23.5, where neighbouring doubles are 2^-49 apart, so the subtractions q - p and r - p already round away the 2^-53 steps that separate the points. The two products are then rounded again, often to the very same double, and their difference comes out as 0 (or, less often, as a small value of the wrong sign) while the exact value is not zero.
          </p>
        )}
        <p className="ch-note">
          Ways out: whole-number coordinates (exact while the products stay below 2^53), exact or adaptive predicates (Shewchuk's robust predicates), and not trusting a double equal to 0 as "collinear". Only the exact test is fully safe here.
        </p>
        <Hint>The points are too close together to draw: they differ from each other by a few steps of 2^-53, far less than a pixel.</Hint>
      </div>
      <ProvenanceRow>
        <Provenance kind="real">a fixed example found by a seeded search; the exact answer is computed with BigInt on the doubles' exact values</Provenance>
        <ClaimLabel kind="research">Kettner et al., "Classroom examples of robustness problems in geometric computations": the setup, from memory, verify</ClaimLabel>
        <Provenance kind="from-memory">Shewchuk's adaptive exact predicates: named, not shown; verify</Provenance>
      </ProvenanceRow>
    </StageFrame>
  );
}
