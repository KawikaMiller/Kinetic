import { Bar } from '../../components/Bar';
import { Legend } from '../../components/ui';
import { loadFractions } from './shardMath';
import { SHARDS } from './skew';

/** The bars stop at this share of one shard's capacity or the busiest shard, whichever is larger. */
const MIN_SCALE = 1.5;
const pct = (v: number) => `${Math.round(v * 100)}%`;

export const SHARD_LEGEND = (
  <Legend
    items={[
      { color: 'var(--ok)', label: 'a shard under its capacity (the mark)' },
      { color: 'var(--bad)', label: 'a shard past its capacity' },
      { color: 'var(--hi)', label: 'the hottest shard (outlined)' },
      { color: 'var(--orange)', label: 'the hot key' },
      { color: 'var(--violet)', label: 'salted sub-keys' },
      { color: 'var(--info)', label: 'requests a cache absorbed' },
    ]}
  />
);

export interface BarSet {
  name: string;
  loads: number[];
  /** The plain request count the loads came from. */
  requests: number;
}

/** Eight shard bars with the capacity mark; one or two sets side by side (a second, fainter set for "before"). */
export function ShardBars({ sets, util, caption }: { sets: BarSet[]; util: number; caption: string }) {
  const fractions = sets.map((s) => loadFractions(s.loads, util, s.requests));
  const scale = Math.max(MIN_SCALE, ...fractions.flat());
  return (
    <div className="hk-bars" role="group" aria-label={caption}>
      {Array.from({ length: SHARDS }, (_, i) => {
        const hottest = fractions[0].indexOf(Math.max(...fractions[0])) === i;
        return (
          <div key={i} className={`hk-shard${hottest ? ' is-hottest' : ''}`}>
            <span className="hk-shard-name">shard {i}</span>
            <div className="hk-shard-bars">
              {sets.map((s, k) => (
                <Bar
                  key={s.name}
                  value={fractions[k][i]}
                  max={scale}
                  tone={fractions[k][i] > 1 ? 'bad' : 'ok'}
                  marker={1 / scale}
                  height={k === 0 ? 14 : 6}
                  animate={false}
                  className={k === 0 ? '' : 'hk-faint'}
                  ariaLabel={`${s.name}, shard ${i}: ${pct(fractions[k][i])} of its capacity`}
                />
              ))}
            </div>
            <span className="hk-shard-load" style={{ color: fractions[0][i] > 1 ? 'var(--bad)' : undefined }}>{pct(fractions[0][i])}</span>
          </div>
        );
      })}
    </div>
  );
}
