import { useMemo, useState, type ReactNode } from 'react';
import { Box, SectionTitle } from '../../components/Panel';
import { SeedField } from '../../components/SeedField';
import { StageFrame } from '../../components/StageFrame';
import { Hint, Legend, Provenance, ProvenanceRow, Stat, Stats, Toggle } from '../../components/ui';
import { useIntroCaption } from '../../core/caption';
import { sig } from '../../core/format';
import { breakCaption } from './captions';
import { ErrorPlot } from './ErrorPlot';
import { epsilonOf, type Estimator, zipfStream } from '../../core/countMin';
import { DEFAULT_DEPTH, DEFAULT_SEED, DEFAULT_SKEW, DEFAULT_STREAM, DEFAULT_WIDTH, GHOST_DELETES, errorRun, overCount, underCount } from './stream';

const TINY_WIDTH = 4;

export function BreakScene({ picker }: { picker: ReactNode }) {
  const [how, setHow] = useState<Estimator>('min');
  const [deletes, setDeletes] = useState(false);
  const [tiny, setTiny] = useState(false);
  const [seed, setSeed] = useState(DEFAULT_SEED);

  const w = tiny ? TINY_WIDTH : DEFAULT_WIDTH;
  const ghosts = deletes ? GHOST_DELETES : 0;
  const stream = useMemo(() => zipfStream(DEFAULT_STREAM, DEFAULT_SKEW, seed), [seed]);
  const run = useMemo(() => errorRun(stream, w, DEFAULT_DEPTH, seed, { how, ghostDeletes: ghosts }), [stream, w, seed, how, ghosts]);
  const limit = epsilonOf(w) * run.n;
  const under = underCount(run);
  const worst = Math.max(...run.errors);

  useIntroCaption(breakCaption({ run, how, ghosts }), [run]);

  return (
    <StageFrame
      height={470}
      stats={
        <Stats>
          <Stat label="Overcounted" value={overCount(run)} color="var(--bad)" sub="items estimated above their count" />
          <Stat label="Undercounted" value={under} color={under > 0 ? 'var(--bad)' : 'var(--ok)'} sub="items estimated below their count" />
          <Stat label="Worst overcount" value={sig(worst, 3)} sub={`ε·N is ${sig(limit, 3)} at this width`} />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--info)', label: 'an item within ε·N', shape: 'dot' },
            { color: 'var(--bad)', label: 'over the line, or below zero', shape: 'dot' },
            { color: 'var(--violet)', label: 'the ε·N rule', shape: 'line' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <Toggle label="Estimate by" value={how === 'mean'} onChange={(mean) => setHow(mean ? 'mean' : 'min')} off="The minimum" on="The mean" />
          <Toggle label="Deletes" value={deletes} onChange={setDeletes} off="None" on={`${GHOST_DELETES} of items never added`} />
          <Toggle label="Width" value={tiny} onChange={setTiny} off={`${DEFAULT_WIDTH}`} on={`${TINY_WIDTH} (everything collides)`} />
          <SeedField seed={seed} onSeed={setSeed} />
        </>,
      ]}
    >
      <div className="cm-stage stage-pad">
        <Box>
          <SectionTitle hint={`width ${w}, depth ${DEFAULT_DEPTH}, ${run.n.toLocaleString('en-US')} items over 2,000`}>Error by popularity rank</SectionTitle>
          <div className="cm-plot"><ErrorPlot run={run} limit={limit} /></div>
          <Hint tone="muted" block>
            {deletes
              ? 'A delete subtracts from the cells of an item that was never added, which can pull a cell shared with another item below that item\'s true count, so the minimum can undercount. Deleting items that were added keeps the sketch one-sided.'
              : 'Collisions only ever add, so with the minimum and no deletes no item is estimated below its count. The mean is higher than the minimum, so it overcounts more.'}
          </Hint>
        </Box>
        <ProvenanceRow>
          <Provenance kind="simulated" seed={seed}>a seeded Zipf stream; each broken variant is run for real</Provenance>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}
