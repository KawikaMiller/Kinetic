import { archPath } from '../../core/geometry';
import { TOKENS } from './tokens';

const SLOT = 62;
const PAD = 34;
const BASELINE = 112;
const LIFT = 30;
const MIN_LINE = 1;
const MAX_LINE = 12;
const WIDTH = PAD * 2 + SLOT * (TOKENS.length - 1);
const HEIGHT = 150;

const centre = (i: number) => PAD + SLOT * i;

/**
 * The six tokens in a row, and from the chosen one an arc to each token it attends to: the arc is as thick as the
 * weight, and the number is under the token it points at (the weight on itself sits under its own token). Arcs are
 * `info`, the token attended from is `hi`.
 */
export function TokenArcs({ from, weights, onPick, ariaLabel }: { from: number; weights: readonly number[]; onPick?: (i: number) => void; ariaLabel: string }) {
  return (
    <svg className="at-arcs" viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-label={ariaLabel}>
      {weights.map((w, j) => {
        if (j === from) return null;
        const lift = LIFT + Math.abs(j - from) * 12;
        return (
          <g key={j} className="tone-info">
            <path className="at-arc" d={archPath(centre(from), centre(j), BASELINE - 14, lift)} strokeWidth={MIN_LINE + (MAX_LINE - MIN_LINE) * w} />
          </g>
        );
      })}
      {TOKENS.map((word, i) => (
        <g key={i} className={i === from ? 'tone-hi' : 'tone-muted'} onClick={onPick && (() => onPick(i))}>
          <rect className="at-token" x={centre(i) - 26} y={BASELINE - 12} width={52} height={28} rx={8} />
          <text className="at-token-text" x={centre(i)} y={BASELINE + 7} textAnchor="middle">{word}</text>
          <text className="at-token-self" x={centre(i)} y={BASELINE + 34} textAnchor="middle">{i === from ? `self ${weights[i].toFixed(2)}` : weights[i].toFixed(2)}</text>
        </g>
      ))}
    </svg>
  );
}
