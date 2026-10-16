import type { ReactNode } from 'react';
import { CellGrid } from '../../components/CellGrid';
import { StageFrame } from '../../components/StageFrame';
import { Legend, Provenance, ProvenanceRow, Stat, Stats } from '../../components/ui';
import { bruteSolutions, compatiblePair, crtBuild, gcdN, lcmN, productN, solve } from './crt';
import { OPENING } from './presets';
import { SystemFields } from './SystemFields';
import { useSystem } from './useSystem';

const GRID_CELL = { cell: 18, font: 0 };

const SHARED_GEARS = 2;

/** Scene 3: moduli that share a factor. Compatible remainders have one solution modulo the lcm; incompatible ones have none. */
export function SharedScene({ picker }: { picker: ReactNode }) {
  const state = useSystem(OPENING.shared.system, SHARED_GEARS);
  const { moduli, residues } = state.system;
  const [m1, m2] = moduli;
  const [a1, a2] = residues;
  const g = gcdN(m1, m2);
  const lcm = lcmN(moduli);
  const product = productN(moduli);
  const verdict = solve(state.system);
  const inLcm = bruteSolutions(state.system, lcm);
  const inProduct = bruteSolutions(state.system, product);
  const broken = crtBuild(state.system, true)!;
  const brokenFails = m1 !== m2 && moduli.some((m, i) => broken.x % m !== residues[i]);

  return (
    <StageFrame
      height={480}
      intro={
        verdict.ok
          ? <>x = {a1} (mod {m1}) and x = {a2} (mod {m2}) agree mod gcd = {g}, so there is exactly one solution in 0 to {lcm - 1} (x = {verdict.x}), unique modulo the lcm {lcm}{lcm === product ? ` (here the lcm equals the product ${product})` : `, not the product ${product}`}: the product range holds {inProduct.length} of them.</>
          : <>x = {a1} (mod {m1}) forces x = {a1 % g} (mod {g}) and x = {a2} (mod {m2}) forces x = {a2 % g} (mod {g}): no x can satisfy both, and a search of 0 to {lcm - 1} finds {inLcm.length}.</>
      }
      introKey={`${m1}-${m2}-${a1}-${a2}`}
      stats={
        <Stats>
          <Stat label="gcd, lcm" value={`${g}, ${lcm}`} color="var(--info)" sub={`product ${product}`} />
          <Stat label="Verdict" value={verdict.ok ? 'solvable' : 'no solution'} color={verdict.ok ? 'var(--ok)' : 'var(--bad)'} sub={verdict.ok ? `x = ${verdict.x} mod ${verdict.modulus}` : `${a1} and ${a2} differ mod ${g}`} />
          <Stat label={`Solutions in 0 to ${lcm - 1}`} value={inLcm.length} color={inLcm.length ? 'var(--ok)' : 'var(--bad)'} sub={`by brute force; in 0 to ${product - 1}: ${inProduct.length}`} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--ok)', label: 'remainder pair with a solution', shape: 'square' },
            { color: 'var(--bad)', label: 'pair with none', shape: 'square' },
            { color: 'var(--hi)', label: 'your pair', shape: 'square' },
            { color: 'var(--info)', label: 'lcm, the range of the answer', shape: 'square' },
          ]}
        />
      }
      controls={[picker, <SystemFields key="fields" state={state} maxGears={SHARED_GEARS} />]}
    >
      <div className="cr-stage stage-pad">
        <p className="cr-note">Every pair of remainders (a1 down, a2 across) for mod {m1} and mod {m2}. Click one, or use the arrow keys and Enter.</p>
        <CellGrid
          rows={m1}
          cols={m2}
          size={GRID_CELL}
          rowLabels={Array.from({ length: m1 }, (_, i) => String(i))}
          colLabels={Array.from({ length: m2 }, (_, j) => String(j))}
          cell={(r, c) => (compatiblePair(r, m1, c, m2) ? { tone: 'ok', fill: 'tint' } : { tone: 'bad', fill: 'tint' })}
          highlight={[{ r: a1, c: a2, tone: 'hi' }]}
          onCellClick={(r, c) => state.setResidues([r, c])}
          cellAriaLabel={(r, c) => `a1 = ${r}, a2 = ${c}: ${compatiblePair(r, m1, c, m2) ? 'has a solution' : 'no solution'}`}
          ariaLabel="Which remainder pairs have a solution"
        />
        <p className="cr-note">
          {verdict.ok
            ? `Compatible pairs are the ones that agree mod ${g}: ${(m1 * m2) / g} of the ${m1 * m2} pairs here.`
            : `This pair disagrees mod ${g}; only the pairs that agree mod ${g} have a solution.`}
        </p>
        <h4 className="cr-h">The coprime formula, applied anyway with the product M = {product}</h4>
        <p className="cr-note">
          {m1 === m2
            ? 'Equal moduli are one congruence repeated: nothing to compare.'
            : g === 1
              ? <>These moduli are coprime, so the formula works as it should: x = {broken.x}, and every remainder checks.</>
            : brokenFails
              ? <>It prints x = {broken.x}, and the check fails: {moduli.map((m, i) => `${broken.x} mod ${m} = ${broken.x % m} (wanted ${residues[i]})`).join('; ')}. The formula needs inverses that do not exist when moduli share a factor, so it was run with 1 in their place (the broken variant).</>
              : <>It prints x = {broken.x}, which happens to pass the check on this pair, but only by luck: the formula needs inverses that do not exist when moduli share a factor.</>}
        </p>
      </div>
      <ProvenanceRow>
        <Provenance kind="toy">toy sizes: moduli of 2 to 30, no keys</Provenance>
        <Provenance kind="real">the solution counts come from checking every x, and the verdict from the gcd rule</Provenance>
      </ProvenanceRow>
    </StageFrame>
  );
}
