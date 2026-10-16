import { useMemo, useState, type ReactNode } from 'react';
import { Box, SectionTitle } from '../../components/Panel';
import { Curve, Plot2D, Points } from '../../components/Plot2D';
import { StageFrame } from '../../components/StageFrame';
import { Button, Legend, Provenance, ProvenanceRow, Slider, Stat, Stats } from '../../components/ui';
import { decimal, integer, sig } from '../../core/format';
import { FEED_PAGE, pullCost } from './feed';
import { FOLLOWEE_STEPS, initialPull, measuredMerge, mergeOverEstimate } from './init';

const PLOT_WIDTH = 356;
const MIN_F = 5;
const MAX_F = 2_000;

export function PullScene({ picker }: { picker: ReactNode }) {
  const [s, setS] = useState(initialPull);
  const F = FOLLOWEE_STEPS[s.followeesIdx];
  const measured = useMemo(() => FOLLOWEE_STEPS.map((f) => ({ f, ...measuredMerge(f) })), []);
  const here = measured[s.followeesIdx];
  const maxOps = Math.max(...measured.map((m) => m.ops));
  const gap = useMemo(() => mergeOverEstimate(), []);

  return (
    <StageFrame
      height={420}
      intro={
        <>
          A reader who follows {integer(F)} {F === 1 ? 'author' : 'authors'} opens their feed: the {FEED_PAGE} newest posts come from a k-way merge of {integer(F)} sorted lists. The heap made {sig(here.ops)} comparisons; the estimate F + N log2 F is {sig(here.estimate)}. The post itself cost one store.
        </>
      }
      introKey={[F]}
      stats={
        <Stats>
          <Stat label="Write cost" value={1} color="var(--violet)" sub="the post is stored once" />
          <Stat label="Read cost (heap comparisons)" value={sig(here.ops)} color="var(--violet)" sub={`merging ${integer(F)} lists for ${FEED_PAGE} posts`} />
          <Stat label="Estimate F + N log2 F" value={sig(here.estimate)} sub={`with N = ${FEED_PAGE} and F = ${integer(F)}`} />
          <Stat label="Measured / estimate" value={decimal(here.ops / here.estimate, 2)} sub={`${decimal(gap.min, 1)} to ${decimal(gap.max, 1)} over every F here`} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--violet)', label: 'pull work: a merge read (the measured points)' },
            { color: 'var(--dim)', label: 'the estimate F + N log2 F' },
          ]}
        />
      }
      controls={
        <>
          {picker}
          <Slider label="People the reader follows" value={s.followeesIdx} min={0} max={FOLLOWEE_STEPS.length - 1} format={(i) => sig(FOLLOWEE_STEPS[i])} onChange={(followeesIdx) => setS({ followeesIdx })} />
          <Button onClick={() => setS(initialPull())}>Reset</Button>
        </>
      }
    >
      <div className="ff-stage stage-pad">
        <Box>
          <SectionTitle hint="both axes logarithmic; the cost of one read grows with F">Read cost against people followed</SectionTitle>
          <Plot2D
            x={{ domain: [MIN_F, MAX_F], log: true, label: 'people the reader follows (F)', ticks: 4 }}
            y={{ domain: [10, Math.max(1_000, maxOps * 1.2)], log: true, label: 'comparisons per read', ticks: 3 }}
            width={PLOT_WIDTH}
            ariaLabel={`Read cost against people followed: ${sig(here.ops)} comparisons at ${integer(F)}`}
          >
            <Curve fn={(x) => pullCost(x)} tone="dim" dashed />
            <Points data={measured.map((m) => ({ x: m.f, y: m.ops, tone: m.f === F ? ('hi' as const) : ('violet' as const) }))} />
          </Plot2D>
          <p className="ff-note">The measured points run {decimal(gap.min, 1)} to {decimal(gap.max, 1)} times above the grey estimate at every F: a heap compares about twice per level when it pops, and the estimate counts each level once. The two lines grow together; they do not coincide.</p>
        </Box>
        <ProvenanceRow>
          <Provenance kind="simulated">a real heap merge of F lists of {FEED_PAGE} posts, counting every comparison; units are comparisons, not milliseconds</Provenance>
          <Provenance kind="illustrative">the lists are synthetic, newest first; real timelines also rank, filter and cache</Provenance>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}
