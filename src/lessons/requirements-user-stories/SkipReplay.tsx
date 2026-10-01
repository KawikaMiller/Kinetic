import { motion } from 'motion/react';
import { useMemo, type ReactNode } from 'react';
import { StageFrame } from '../../components/StageFrame';
import { Hint, Stat, Stats } from '../../components/ui';
import { usePlayer } from '../../core/usePlayer';
import { buildSkipFrames } from './frames';
import { BUILD_DAYS, MATERIAL, question, REFINEMENT_DAYS, skipCost } from './model';

const cost = skipCost();
/** Timeline scale: the longest bar fills the track. */
const SCALE_DAYS = Math.ceil(cost.skipped);
const widthOf = (days: number) => `${(days / SCALE_DAYS) * 100}%`;

export function SkipReplay({ picker }: { picker: ReactNode }) {
  const frames = useMemo(() => buildSkipFrames(), []);
  const player = usePlayer(frames, { interval: 1500 });
  const f = player.frame;
  const buildShown = Math.min(f.days, BUILD_DAYS);

  return (
    <StageFrame
      player={player}
      height={420}
      stats={
        <Stats>
          <Stat label="Days so far" value={f.days.toFixed(1)} color={f.days > BUILD_DAYS ? 'var(--bad)' : 'var(--info)'} sub={`planned: ${BUILD_DAYS}`} />
          <Stat label="Surprises" value={`${f.found.length}/${MATERIAL.length}`} color="var(--bad)" sub="questions nobody asked" />
          <Stat label="If refined first" value={cost.refined.toFixed(1)} color="var(--ok)" sub={`${REFINEMENT_DAYS} d refinement + build`} />
        </Stats>
      }
      controls={[
        <>{picker}</>,
        <Hint key="note" block>Scripted scenario with illustrative day counts: one plausible way the missing answers show up.</Hint>,
      ]}
    >
      <div className="rq-skip stage-pad">
        <div className="rq-timeline">
          <span className="rq-timeline-label">Skipped refinement</span>
          <div className="rq-track">
            <motion.div className="rq-seg is-build" initial={false} animate={{ width: widthOf(buildShown) }}>build</motion.div>
            {f.found.map((id) => (
              <motion.div key={id} className="rq-seg is-rework" initial={{ width: 0 }} animate={{ width: widthOf(question(id).reworkDays) }}
                title={question(id).text} />
            ))}
          </div>
        </div>
        <div className="rq-timeline">
          <span className="rq-timeline-label">Refined first</span>
          <div className="rq-track">
            <div className="rq-seg is-refine" style={{ width: widthOf(REFINEMENT_DAYS) }} />
            <div className="rq-seg is-build" style={{ width: widthOf(BUILD_DAYS) }}>build</div>
          </div>
        </div>
        <ul className="rq-surprises">
          {f.found.map((id) => {
            const q = question(id);
            return (
              <motion.li key={id} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} className={id === f.surprise ? 'is-now' : ''}>
                <span className="rq-surprise-q">Never asked: {q.text}</span>
                <span className="rq-surprise-cost">+{q.reworkDays} d</span>
              </motion.li>
            );
          })}
        </ul>
      </div>
    </StageFrame>
  );
}
