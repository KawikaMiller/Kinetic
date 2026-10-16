import { useMemo, useState, type ReactNode } from 'react';
import { Bar } from '../../components/Bar';
import { Box, SectionTitle } from '../../components/Panel';
import { SeedField } from '../../components/SeedField';
import { StageFrame } from '../../components/StageFrame';
import { Button, Legend, Provenance, ProvenanceRow, Slider, Stat, Stats } from '../../components/ui';
import { sig } from '../../core/format';
import { FEED_PAGE, THRESHOLDS, USERS } from './feed';
import { RATIO_STEPS, hybridView, initialHybrid, populationFor } from './init';

const thresholdText = (t: number) => (t === 0 ? '0 (everyone is pulled)' : Number.isFinite(t) ? `${t} followers` : 'none (everyone is pushed)');
const msText = (ms: number) => (ms >= 1000 ? `${sig(ms / 1000)} s` : `${sig(ms)} ms`);

export function HybridScene({ picker }: { picker: ReactNode }) {
  const [s, setS] = useState(initialHybrid);
  const pop = useMemo(() => populationFor(s.seed), [s.seed]);
  const v = useMemo(() => hybridView(pop, s), [pop, s]);
  const top = Math.max(v.push.total, v.pull.total, v.hybrid.total);
  const rows: { name: string; work: typeof v.push }[] = [
    { name: 'Push', work: v.push },
    { name: 'Pull', work: v.pull },
    { name: `Hybrid, pull above ${Number.isFinite(v.threshold) ? v.threshold : 'infinity'}`, work: v.hybrid },
  ];
  const cheaper = v.push.total < v.pull.total ? 'push' : 'pull';

  return (
    <StageFrame
      height={460}
      intro={
        <>
          At {v.readsPerPost} reads per post {cheaper} does less total work, and the crossover between pure push and pure pull sits at {sig(v.crossover)} reads per post. The hybrid pulls the {v.celebrities} {v.celebrities === 1 ? 'author' : 'authors'} above {Number.isFinite(v.threshold) ? v.threshold : 'infinity'} followers: the biggest push is {msText(v.worstHybridMs)} instead of {msText(v.worstPushMs)}.
        </>
      }
      introKey={[s.thresholdIdx, s.ratioIdx, s.seed]}
      stats={
        <Stats>
          <Stat label="Crossover, push against pull" value={sig(v.crossover)} sub="reads per post where the two cost the same here" />
          <Stat label="Celebrities at this threshold" value={v.celebrities} color={v.celebrities > 0 ? 'var(--hi)' : undefined} sub={`authors pulled, of ${USERS}`} />
          <Stat label="Slowest post, pure push" value={msText(v.worstPushMs)} color="var(--bad)" sub="until the last follower can see it" />
          <Stat label="Slowest post, hybrid" value={msText(v.worstHybridMs)} color="var(--ok)" sub="pulled authors cost one store" />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--info)', label: 'push work: inbox writes' },
            { color: 'var(--violet)', label: 'pull work: merge reads' },
            { color: 'var(--hi)', label: 'a celebrity (pulled) author' },
            { color: 'var(--ok)', label: 'the cheap side, in total work' },
            { color: 'var(--bad)', label: 'the costly side' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <Slider label="Celebrity threshold" value={s.thresholdIdx} min={0} max={THRESHOLDS.length - 1} format={(i) => thresholdText(THRESHOLDS[i])} onChange={(thresholdIdx) => setS((x) => ({ ...x, thresholdIdx }))} />
          <Slider label="Reads per post" value={s.ratioIdx} min={0} max={RATIO_STEPS.length - 1} format={(i) => String(RATIO_STEPS[i])} onChange={(ratioIdx) => setS((x) => ({ ...x, ratioIdx }))} />
        </>,
        <>
          <SeedField seed={s.seed} onSeed={(seed) => setS((x) => ({ ...x, seed }))} label="Population seed" />
          <Button onClick={() => setS(initialHybrid())}>Reset</Button>
        </>,
      ]}
    >
      <div className="ff-stage stage-pad">
        <Box>
          <SectionTitle hint={`per hour, ${USERS} users each posting once; one feed page is ${FEED_PAGE} posts`}>Total work per hour</SectionTitle>
          <div className="ff-bars">
            {rows.map((r) => (
              <div key={r.name} className="ff-bar-row">
                <span className="ff-bar-name">{r.name}</span>
                <Bar
                  segments={[{ value: r.work.writes, tone: 'info' }, { value: r.work.reads, tone: 'violet' }]}
                  max={top}
                  height={16}
                  animate={false}
                  ariaLabel={`${r.name}: ${sig(r.work.writes)} write units and ${sig(r.work.reads)} read units`}
                />
                <span className="ff-bar-total" style={{ color: r.work.total === top ? 'var(--bad)' : r.work.total === Math.min(v.push.total, v.pull.total, v.hybrid.total) ? 'var(--ok)' : undefined }}>
                  {sig(r.work.total)}
                </span>
              </div>
            ))}
          </div>
          <p className="ff-note">Blue is inbox writes, violet is merge reads. The hybrid does not beat the cheaper of push and pull on total work; what it buys is a bound on the slowest post.</p>
        </Box>
        <ProvenanceRow>
          <Provenance kind="simulated" seed={s.seed}>a seeded population of {USERS} users with a Zipf-like follower distribution, a scaled-down model</Provenance>
          <Provenance kind="illustrative">work in abstract units (inbox inserts and heap comparisons); real feeds also rank, filter and cache, and companies&apos; own designs differ: no real company&apos;s numbers are used</Provenance>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}
