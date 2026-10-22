import { useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Bar } from '../../components/Bar';
import { ConfusionMatrix } from '../../components/ConfusionMatrix';
import { Box, SectionTitle } from '../../components/Panel';
import { Curve, Plot2D, VLine } from '../../components/Plot2D';
import { SeedField } from '../../components/SeedField';
import { StageFrame } from '../../components/StageFrame';
import { Button, Hint, Legend, Provenance, ProvenanceRow, Slider, Stat, Stats } from '../../components/ui';
import { useIntroCaption } from '../../core/caption';
import { integer, pct, sig } from '../../core/format';
import { popsCaption, scrubCaption } from './captions';
import { initialPops, type PopsUi } from './init';
import { ATTACK_RANGE, EXTRA_RANGE, LEGIT_TOTAL, SKEW_RANGE, THRESHOLD_RANGE, pops, runPops, scoreSet, scrubAt, thresholdGrid } from './pops';

export function PopsScene({ picker }: { picker: ReactNode }) {
  const [u, setU] = useState<PopsUi>(initialPops);
  const set = (patch: Partial<PopsUi>) => setU((x) => ({ ...x, ...patch }));
  const p = useMemo(() => pops(u.attack, LEGIT_TOTAL, u.skewPct, u.extra), [u.attack, u.skewPct, u.extra]);
  const run = useMemo(() => runPops({ seed: u.seed, attack: u.attack, skewPct: u.skewPct, extra: u.extra }), [u.seed, u.attack, u.skewPct, u.extra]);
  const scored = useMemo(() => scoreSet(u.seed), [u.seed]);
  const point = useMemo(() => scrubAt(scored, u.threshold), [scored, u.threshold]);
  const curve = useMemo(() => thresholdGrid().map((t) => ({ t, ...scrubAt(scored, t) })), [scored]);

  useIntroCaption(<>{popsCaption(u.attack, u.skewPct, p)} {scrubCaption(point)}</>, [u.attack, u.skewPct, u.extra, u.threshold, u.seed]);

  const capacityAll = p.sites.reduce((a, s) => a + s.capacity, 0);
  return (
    <StageFrame
      height={720}
      stats={
        <Stats>
          <Stat label="Legitimate traffic dropped" value={`${sig(p.legitDropped)} Mbit/s`} color={p.legitDropped > 0.05 ? 'var(--bad)' : 'var(--ok)'} sub={[`of ${LEGIT_TOTAL}; worst second of the run ${sig(run.worstDropped)}`]} />
          <Stat label="Capacity against the attack" value={`${integer(capacityAll)} vs ${integer(u.attack)}`} sub={[capacityAll >= u.attack + LEGIT_TOTAL ? 'the total covers the whole load' : 'the total does not cover the whole load']} />
          <Stat label="Unwanted flows removed" value={pct(point.attackRemoved, 0)} sub={[`${pct(point.legitDropped, 0)} of legitimate flows dropped`]} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--info)', label: 'legitimate traffic' },
            { color: 'var(--orange)', label: 'the abstract unwanted stream' },
            { color: 'var(--bad)', label: 'an overloaded site, or legitimate traffic dropped' },
            { color: 'var(--dim)', label: 'a site\'s capacity (tick)' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <Button onClick={() => setU(initialPops())}>Reset</Button>
          <Button onClick={() => set({ skewPct: 0 })}>Rebalance the catchment</Button>
        </>,
        <>
          <Slider label="Unwanted load" value={u.attack} {...ATTACK_RANGE} format={(v) => `${integer(v)} Mbit/s`} onChange={(attack) => set({ attack })} />
          <Slider label="Catchment skew to site 1" value={u.skewPct} {...SKEW_RANGE} format={(v) => `${v}%`} onChange={(skewPct) => set({ skewPct })} />
          <Slider label="Extra capacity at site 1" value={u.extra} {...EXTRA_RANGE} format={(v) => `${integer(v)} Mbit/s`} onChange={(extra) => set({ extra })} />
        </>,
        <>
          <Slider label="Scrubbing threshold" value={u.threshold} {...THRESHOLD_RANGE} format={(v) => sig(v)} onChange={(threshold) => set({ threshold })} />
          <SeedField seed={u.seed} onSeed={(seed) => set({ seed })} />
        </>,
      ]}
    >
      <div className="dd-stage stage-pad">
        <Box>
          <SectionTitle hint="five points of presence, load against capacity">Absorb: anycast sites</SectionTitle>
          <div className="dd-sites">
            {p.sites.map((s, i) => (
              <div key={i} className="dd-site">
                <span className="dd-site-name">Site {i + 1}</span>
                <Bar
                  segments={[{ value: s.legitServed, tone: 'info' }, { value: s.legit - s.legitServed, tone: 'bad' }, { value: s.attack, tone: 'orange' }]}
                  max={Math.max(s.capacity, s.load)}
                  marker={s.capacity}
                  markLabel="capacity"
                  height={12}
                  ariaLabel={`Site ${i + 1}: ${integer(Math.round(s.load))} Mbit/s arriving, capacity ${integer(s.capacity)}`}
                />
                <span className={`dd-site-note ${s.load > s.capacity ? 'is-bad' : ''}`}>{integer(Math.round(s.load))} of {integer(s.capacity)}</span>
              </div>
            ))}
          </div>
        </Box>
        <div className="dd-scrub">
          <Box>
            <SectionTitle hint={`${integer(point.confusion.tp + point.confusion.fn)} unwanted, ${integer(point.confusion.fp + point.confusion.tn)} legitimate flows`}>Filter: scrubbing</SectionTitle>
            <ConfusionMatrix {...point.confusion} labels={{ positive: 'unwanted flow', negative: 'legitimate flow' }} />
          </Box>
          <Box>
            <SectionTitle hint="across thresholds">Removed against dropped</SectionTitle>
            <Plot2D x={{ domain: [0, THRESHOLD_RANGE.max], label: 'threshold' }} y={{ domain: [0, 1], label: 'share', format: (v) => pct(v, 0) }} ariaLabel="Share of unwanted and of legitimate flows dropped, against the scrubbing threshold">
              <Curve points={curve.map((c) => [c.t, c.attackRemoved])} tone="orange" />
              <Curve points={curve.map((c) => [c.t, c.legitDropped])} tone="bad" />
              <VLine at={u.threshold} label="threshold" tone="hi" />
            </Plot2D>
          </Box>
        </div>
        <Hint tone="muted" block>
          Total capacity above the attack is not enough: the catchment decides who gets what, and one overloaded site drops legitimate users. As a last resort a victim can ask upstream networks to drop all traffic to it by routing signals (remote blackholing, from memory): that drops the legitimate traffic too. See <Link to="/lesson/bgp">BGP</Link> for the routing side.
        </Hint>
        <ProvenanceRow>
          <Provenance kind="simulated" seed={u.seed}>the sites run second by second and the scores are drawn from the seed; no traffic is generated</Provenance>
          <Provenance kind="illustrative">every capacity, rate and score distribution is made up</Provenance>
          <Provenance kind="from-memory">remote blackholing by routing-community signalling as a last resort; verify with your provider</Provenance>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}
