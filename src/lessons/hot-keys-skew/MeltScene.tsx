import { useMemo, useState, type ReactNode } from 'react';
import { Box, SectionTitle } from '../../components/Panel';
import { SeedField } from '../../components/SeedField';
import { StageFrame } from '../../components/StageFrame';
import { Button, Legend, Provenance, ProvenanceRow, Slider, Stat, Stats } from '../../components/ui';
import { pctText, sig } from '../../core/format';
import { usePlayer } from '../../core/usePlayer';
import { FILL_TICKS, KEYS, SHARDS, SKEW, TICK_REQUESTS, UTILISATION, fillSim, hottestShare, keyStandsOut, saturationAt, saturationEstimate } from './skew';
import { initialMelt } from './init';
import { ShardBars } from './ShardBars';
import { SHARD_LEGEND_ITEMS, loadFractions } from './shardMath';

const PLAY_MS = 110;

export function MeltScene({ picker }: { picker: ReactNode }) {
  const [s, setS] = useState(initialMelt);
  const sim = useMemo(() => {
    const x = fillSim(s.seed, s.skew);
    x.run(FILL_TICKS);
    return x;
  }, [s.seed, s.skew]);
  const final = useMemo(() => sim.at(FILL_TICKS)!, [sim]);
  const finalShares = useMemo(() => final.loads.map((x) => x / final.requests), [final]);
  const p1 = hottestShare(s.skew);
  const exact = saturationAt(finalShares);
  /** The first batch from which the busiest shard stays past its capacity to the end of the stream, or null. */
  const first = useMemo(() => {
    let from: number | null = null;
    for (let t = FILL_TICKS; t >= 1; t--) {
      if (Math.max(...loadFractions(sim.at(t)!.loads, s.util, sim.at(t)!.requests)) > 1) from = t;
      else break;
    }
    return from;
  }, [sim, s.util]);
  const frames = useMemo(() => {
    const spread = Math.max(...finalShares) * SHARDS;
    const intro = (
      <>
        {FILL_TICKS * TICK_REQUESTS} seeded requests arrive in {FILL_TICKS} batches of {TICK_REQUESTS}; each lands on the shard its key hashes to. The hottest key carries {pctText(p1, 1)} of the traffic (1 / H = {sig(p1)}). Press play.
      </>
    );
    const summary = (
      <>
        The busiest shard took {sig(spread)} times the mean load. It is at {pctText(Math.max(...loadFractions(final.loads, s.util, final.requests)), 0)} of its capacity while the cluster as a whole is {pctText(s.util, 0)} used; it saturates at {pctText(exact, 0)} total utilisation.
      </>
    );
    return Array.from({ length: FILL_TICKS + 1 }, (_, t) => ({
      tick: t,
      say: t === 0 ? intro : t === FILL_TICKS ? summary : t === first ? (
        <>
          From batch {t} on, the busiest shard stays <span className="hl bad">past its capacity</span> while the cluster is only {pctText(s.util, 0)} used.
        </>
      ) : undefined,
      hold: t === FILL_TICKS || t === first ? 2.2 : undefined,
    }));
  }, [final, finalShares, p1, exact, first, s.util]);
  const player = usePlayer(frames, { interval: PLAY_MS, autoplay: true });
  const tick = player.frame.tick;
  const at = sim.at(tick)!;
  const standsOut = keyStandsOut(s.skew);
  const culprit = standsOut ? `user:1 (${pctText(p1, 1)} of all requests)` : 'none: no single key stands out';

  return (
    <StageFrame
      height={460}
      player={player}
      stats={
        <Stats>
          <Stat label="Hottest shard / plain mean" value={sig(Math.max(...finalShares) * SHARDS)} color={Math.max(...finalShares) * SHARDS > 1.5 ? 'var(--bad)' : undefined} sub="of all 20,000 requests" />
          <Stat label="First shard saturates at" value={pctText(exact, 0)} color={exact < s.util ? 'var(--bad)' : 'var(--ok)'} sub={`total utilisation; the formula says ${pctText(saturationEstimate(s.skew), 0)}`} />
          <Stat label="The culprit" value={standsOut ? 'user:1' : 'none'} color={standsOut ? 'var(--orange)' : undefined} sub={culprit} />
        </Stats>
      }
      legend={<Legend items={[...SHARD_LEGEND_ITEMS, { color: 'var(--orange)', label: 'the culprit key: the number, not a bar' }]} />}
      controls={[
        <>
          {picker}
          <Slider label="Zipf exponent s" value={s.skew} min={SKEW.min} max={SKEW.max} step={SKEW.step} format={(v) => (v === 0 ? '0 (uniform)' : String(v))} onChange={(skew) => setS((x) => ({ ...x, skew }))} />
          <Slider label="Total utilisation" value={s.util} min={UTILISATION.min} max={UTILISATION.max} step={UTILISATION.step} format={(v) => pctText(v, 0)} onChange={(util) => setS((x) => ({ ...x, util }))} />
        </>,
        <>
          <SeedField seed={s.seed} onSeed={(seed) => setS((x) => ({ ...x, seed }))} label="Stream seed" />
          <Button onClick={() => setS(initialMelt())}>Reset</Button>
        </>,
      ]}
    >
      <div className="hk-stage stage-pad">
        <Box>
          <SectionTitle hint={`${sig(at.requests)} requests so far; shard = hash of the key mod ${SHARDS}`}>Eight shards, load against capacity</SectionTitle>
          <ShardBars sets={[{ name: 'load', loads: at.loads, requests: at.requests }]} util={s.util} caption={`Load of each of the ${SHARDS} shards as a share of its capacity`} />
          <p className="hk-note">The dashed mark on each bar is that shard&apos;s capacity. Hashing spreads the 1,000 keys evenly over the shards; it cannot spread the requests of one key.</p>
        </Box>
        <ProvenanceRow>
          <Provenance kind="simulated" seed={s.seed}>a seeded request stream on the fixed-tick sim, {KEYS} keys, 8 shards, mod placement</Provenance>
          <Provenance kind="illustrative">Zipf is a model of popularity, real skew varies; the 1/H figure is computed on screen, not asserted</Provenance>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}
