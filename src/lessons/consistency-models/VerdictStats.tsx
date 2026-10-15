import { Stat, Stats } from '../../components/ui';
import { MODEL_NAME, ORDER_MODELS, strongestHolding, type OrderModel, type Verdict, type Verdicts } from './model';

const mark = (v: Verdict): string => (v.ok ? '✓ holds' : '✗ fails');
const tone = (v: Verdict): string => (v.ok ? 'var(--ok)' : 'var(--bad)');

const CONVERGED_VALUE = { ok: '✓ yes', bad: '✗ no', na: 'not decided' } as const;
const CONVERGED_COLOUR = { ok: 'var(--ok)', bad: 'var(--bad)', na: 'var(--info)' } as const;

/**
 * The verdict pills: one per order model, then (scene 1) the separate "converged" one. `subsetSizes` is the size of the smallest
 * violating set for each model that fails. Every word comes from the checkers' result.
 */
export function VerdictStats({
  verdicts, converged, subsetSizes,
}: {
  verdicts: Record<OrderModel, Verdict>;
  converged?: Verdicts['converged'];
  subsetSizes?: Partial<Record<OrderModel, number>>;
}) {
  const strongest = strongestHolding(verdicts);
  return (
    <Stats>
      {ORDER_MODELS.map((m) => {
        const v = verdicts[m];
        const size = subsetSizes?.[m];
        const sub = v.ok
          ? strongest === m ? 'the strongest that holds' : 'holds, implied by a stronger one'
          : size === undefined ? undefined : `breaks with ${size} ${size === 1 ? 'operation' : 'operations'}`;
        return <Stat key={m} label={MODEL_NAME[m]} value={mark(v)} color={tone(v)} sub={sub} />;
      })}
      {converged && <Stat label="Converged" value={CONVERGED_VALUE[converged.state]} color={CONVERGED_COLOUR[converged.state]} sub="a separate question from order" />}
    </Stats>
  );
}
