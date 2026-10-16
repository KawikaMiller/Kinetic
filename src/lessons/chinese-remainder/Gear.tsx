export const GEAR_W = 130;
export const GEAR_H = 176;
const CX = GEAR_W / 2;
const CY = 70;
const RADIUS = 46;
const TOOTH = 8;

const angleOf = (tooth: number, teeth: number) => -Math.PI / 2 + (2 * Math.PI * tooth) / teeth;
const point = (r: number, a: number) => ({ x: CX + r * Math.cos(a), y: CY + r * Math.sin(a) });

/** One gear: m teeth, the wanted remainder marked, a pointer at x mod m. It lights green when the pointer is on the wanted tooth. */
export function Gear({ modulus, residue, x }: { modulus: number; residue: number; x: number }) {
  const at = x % modulus;
  const lit = at === residue;
  const tip = point(RADIUS - 6, angleOf(at, modulus));
  const target = point(RADIUS + TOOTH + 6, angleOf(residue, modulus));
  return (
    <svg className="cr-gear" viewBox={`0 0 ${GEAR_W} ${GEAR_H}`} width={GEAR_W} height={GEAR_H} role="img" aria-label={`Gear with ${modulus} teeth, pointer at ${at}, wanted remainder ${residue}${lit ? ', matching' : ''}`}>
      <circle className={`cr-dial${lit ? ' is-lit' : ''}`} cx={CX} cy={CY} r={RADIUS} />
      {Array.from({ length: modulus }, (_, k) => {
        const a = angleOf(k, modulus);
        const from = point(RADIUS, a);
        const to = point(RADIUS + TOOTH, a);
        return <line key={k} className={`cr-tooth${k === residue ? ' is-wanted' : ''}`} x1={from.x} y1={from.y} x2={to.x} y2={to.y} />;
      })}
      <circle className="cr-wanted" cx={target.x} cy={target.y} r={3.5} />
      <line className="cr-pointer" x1={CX} y1={CY} x2={tip.x} y2={tip.y} />
      <circle className="cr-hub" cx={CX} cy={CY} r={4} />
      <text className="cr-label" x={CX} y={CY + RADIUS + 34} textAnchor="middle">m = {modulus}</text>
      <text className={`cr-label${lit ? ' is-lit' : ''}`} x={CX} y={CY + RADIUS + 52} textAnchor="middle">x mod {modulus} = {at}</text>
      <text className="cr-label cr-dim" x={CX} y={CY + RADIUS + 68} textAnchor="middle">wanted {residue}</text>
    </svg>
  );
}
