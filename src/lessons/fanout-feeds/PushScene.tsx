import { useMemo, useState, type ReactNode } from 'react';
import { CellGrid } from '../../components/CellGrid';
import { Box, SectionTitle } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { Button, Legend, Provenance, ProvenanceRow, Slider, Stat, Stats } from '../../components/ui';
import { sig } from '../../core/format';
import { timeFrames } from '../../core/frames';
import { usePlayer } from '../../core/usePlayer';
import { FOLLOWER_STEPS, INSERT_MS, SAMPLE_CELLS, SAMPLE_COLS, WORKERS, doneAt, makeDrain } from './drain';
import { initialPush } from './init';

const PLAY_MS = 120;
const msText = (ms: number) => (ms >= 1000 ? `${sig(ms / 1000)} s` : `${sig(ms)} ms`);

export function PushScene({ picker }: { picker: ReactNode }) {
  const [s, setS] = useState(initialPush);
  const followers = FOLLOWER_STEPS[s.followersIdx];
  const drain = useMemo(() => makeDrain(followers, s.workers, s.insertMs), [followers, s.workers, s.insertMs]);
  const frames = useMemo(
    () =>
      timeFrames({
        end: drain.totalMs,
        steps: 30,
        milestones: [
          { t: Math.min(drain.totalMs, s.insertMs), say: <>After the first insert the first followers can see the post; the other {sig(followers - s.workers)} fan-out tasks are still queued.</> },
          { t: drain.totalMs / 2, say: <>Halfway through the drain: about {sig(followers / 2)} inboxes hold the post, and the rest of the followers still see a <span className="hl orange">stale feed</span>.</> },
        ],
        intro: (
          <>
            One author with {sig(followers)} followers posts once. A fan-out job writes the post id into every follower&apos;s inbox: {sig(followers)} inserts, spread over {s.workers} {s.workers === 1 ? 'worker' : 'workers'} at {s.insertMs} ms each. Press play.
          </>
        ),
        summary: (
          <>
            All {sig(followers)} inboxes hold the post after {msText(drain.totalMs)}: ceil({sig(followers)} / {s.workers}) rounds of {s.insertMs} ms. A read costs one inbox read, whatever the author&apos;s follower count.
          </>
        ),
        hold: 2.2,
      }),
    [drain, followers, s.insertMs, s.workers],
  );
  const player = usePlayer(frames, { interval: PLAY_MS, autoplay: true });
  const now = player.frame.now;
  const done = doneAt(drain, now);
  const sampled = Math.min(SAMPLE_CELLS, followers);
  const filled = Math.floor((done / followers) * sampled + 1e-9);
  const rows = Math.ceil(sampled / SAMPLE_COLS);

  return (
    <StageFrame
      height={460}
      player={player}
      stats={
        <Stats>
          <Stat label="Write cost" value={sig(followers)} color="var(--info)" sub="inbox inserts for this one post" />
          <Stat label="Read cost" value={1} sub="one inbox read" />
          <Stat label="Inboxes written" value={sig(done)} color="var(--ok)" sub={`of ${sig(followers)} at ${msText(now)}`} />
          <Stat label="Still stale" value={sig(followers - done)} color={followers - done > 0 ? 'var(--orange)' : undefined} sub="followers whose inbox lacks the post" />
          <Stat label="Last follower sees it after" value={msText(drain.totalMs)} sub="workers share the inserts" />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--ok)', label: 'an inbox that holds the post' },
            { color: 'var(--dim)', label: 'an inbox still empty' },
            { color: 'var(--info)', label: 'push work: an inbox write' },
            { color: 'var(--orange)', label: 'a stale feed (not fanned out yet)' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <Slider label="Followers of the author" value={s.followersIdx} min={0} max={FOLLOWER_STEPS.length - 1} format={(i) => sig(FOLLOWER_STEPS[i])} onChange={(followersIdx) => setS((x) => ({ ...x, followersIdx }))} />
          <Slider label="Fan-out workers" value={s.workers} min={WORKERS.min} max={WORKERS.max} step={WORKERS.step} onChange={(workers) => setS((x) => ({ ...x, workers }))} />
          <Slider label="Time per insert" value={s.insertMs} min={INSERT_MS.min} max={INSERT_MS.max} step={INSERT_MS.step} format={(v) => `${v} ms`} onChange={(insertMs) => setS((x) => ({ ...x, insertMs }))} />
          <Button onClick={() => setS(initialPush())}>Reset</Button>
        </>,
      ]}
    >
      <div className="ff-stage stage-pad">
        <Box>
          <SectionTitle hint={followers > SAMPLE_CELLS ? `a sample of ${SAMPLE_CELLS} of the ${sig(followers)} inboxes; the rest are counted, not drawn` : `${followers} inboxes`}>The followers&apos; inboxes</SectionTitle>
          <CellGrid
            rows={rows}
            cols={SAMPLE_COLS}
            size="xs"
            cell={(r, c) => {
              const i = r * SAMPLE_COLS + c;
              if (i >= sampled) return { fill: 'none' };
              return i < filled ? { tone: 'ok', fill: 'solid' } : { tone: 'dim', fill: 'tint', intensity: 0.25 };
            }}
            ariaLabel={`${filled} of ${sampled} sampled inboxes hold the post`}
          />
        </Box>
        <ProvenanceRow>
          <Provenance kind="simulated">the fan-out queue drains on the fixed-tick sim; the number of followers above 300 is counted, not drawn</Provenance>
          <Provenance kind="illustrative">work in abstract units: one insert is one unit of {s.insertMs} ms here, not a real database&apos;s cost; no real company&apos;s numbers are used</Provenance>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}
