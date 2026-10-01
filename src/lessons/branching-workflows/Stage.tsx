import { useMemo, useState } from 'react';
import { AnimatedValue } from '../../components/AnimatedValue';
import { CommitGraph } from '../../components/CommitGraph';
import { Box, SectionTitle } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { Button, Hint, Legend, Segmented, Toggle } from '../../components/ui';
import type { CommitGraphSpacing } from '../../core/commitGraph';
import { cssVar, type TokenName } from '../../core/palette';
import { usePlayer } from '../../core/usePlayer';
import { conflictsBy, weekFrames, type SidePlan } from './frames';
import { buildGraph, type SideGraph } from './graph';
import { DAYS, edits, outcome, strategies, type Side } from './model';
import './styles.css';

const STEP_MS = 1600;
const FIRST_SEED = 7;
const SPACING: CommitGraphSpacing = { col: 36, row: 74, padX: 30, padY: 58, bottomRoom: 22 };
const BADGE_R = 9;

const TEAMS: { value: number; label: string }[] = [2, 3, 4].map((n) => ({ value: n, label: String(n) }));
const LIFETIMES: { value: number; label: string }[] = [
  { value: 5, label: '5 days' },
  { value: 10, label: '10 days' },
];

const SIDE_TITLE: Record<Side, string> = { long: 'Long-lived branches (GitFlow-style)', trunk: 'Trunk-based' };

export function Stage() {
  const [team, setTeam] = useState(3);
  const [lifetime, setLifetime] = useState(5);
  const [flags, setFlags] = useState(true);
  const [seed, setSeed] = useState(FIRST_SEED);

  const plan = useMemo(() => {
    const e = edits(team, seed);
    const s = strategies(lifetime, flags);
    const sides = {
      long: { strategy: s.long, outcome: outcome(e, s.long) },
      trunk: { strategy: s.trunk, outcome: outcome(e, s.trunk) },
    } satisfies Record<Side, SidePlan>;
    const graphs = {
      long: buildGraph(team, s.long, sides.long.outcome.merges),
      trunk: buildGraph(team, s.trunk, sides.trunk.outcome.merges),
    } satisfies Record<Side, SideGraph>;
    return { sides, graphs, frames: weekFrames(sides) };
  }, [team, lifetime, flags, seed]);
  const player = usePlayer(plan.frames, { interval: STEP_MS });
  const day = player.frame.day;

  return (
    <StageFrame
      player={player}
      height={560}
      legend={
        <Legend
          items={[
            { color: devColour(0), label: 'a developer\'s lane', shape: 'dot' },
            { color: 'var(--bad)', label: 'conflicts to resolve' },
            { color: 'var(--ok)', label: 'merged into main' },
            { color: 'var(--dim)', label: 'behind a feature flag (off)' },
            { color: 'var(--hi)', label: 'today' },
          ]}
        />
      }
      controls={[
        <>
          <Segmented label="Team size" value={team} onChange={setTeam} options={TEAMS} />
          <Segmented label="Long-lived branch lifetime" value={lifetime} onChange={setLifetime} options={LIFETIMES} />
          <Toggle label="Trunk: feature flags" value={flags} onChange={setFlags} off="Off" on="On" />
          <Button onClick={() => setSeed((s) => s + 1)}>New week</Button>
        </>,
        <Hint key="note">Simplified model: conflicts estimated from overlapping edits (same area, same integration window).</Hint>,
      ]}
    >
      <div className="bw stage-pad">
        <DayRuler day={day} />
        {(['long', 'trunk'] as Side[]).map((side) => (
          <SidePanel key={side} side={side} plan={plan.sides[side]} graph={plan.graphs[side]} day={day} team={team} />
        ))}
      </div>
    </StageFrame>
  );
}

function DayRuler({ day }: { day: number }) {
  return (
    <div className="bw-days" aria-label={day < 0 ? 'Before the week' : `Day ${day + 1} of ${DAYS}`}>
      {Array.from({ length: DAYS }, (_, d) => (
        <span key={d} className={d === day ? 'is-today' : d < day ? 'is-past' : ''}>
          {d + 1}
        </span>
      ))}
    </div>
  );
}

/**
 * Developer lane colours: categorical, minus the status colours this lesson already uses
 * (green = merged into main, yellow = today, red = conflicts), so a lane never reads as a status.
 */
const DEV_TONES: readonly TokenName[] = ['info', 'violet', 'pink', 'orange', 'sky'];
const devColour = (i: number) => cssVar(DEV_TONES[i % DEV_TONES.length]);

/** Lane colours: main and develop neutral, each developer their own colour on both sides. */
function laneColorFor(plan: SidePlan) {
  const direct = plan.strategy.flags && plan.strategy.lifetime === 1;
  const firstDevLane = plan.strategy.integrateTo === 'develop' ? 2 : 1;
  return (lane: number) => (direct || lane < firstDevLane ? (lane === 0 ? 'var(--muted)' : 'var(--faint)') : devColour(lane - firstDevLane));
}

function SidePanel({ side, plan, graph, day, team }: { side: Side; plan: SidePlan; graph: SideGraph; day: number; team: number }) {
  const commits = graph.commits.filter((c) => c.day <= day);
  const shownIds = new Set(commits.map((c) => c.id));
  const conflicts = conflictsBy(plan.outcome, day);
  const ciVerdict = plan.outcome.integrateEvery === 1 ? 'daily: CI tests the combined code' : `every ${plan.outcome.integrateEvery} days: CI mostly tests branches alone`;
  return (
    <Box className={`bw-side is-${side}`}>
      <SectionTitle hint={`${team} developers`}>{SIDE_TITLE[side]}</SectionTitle>
      <div className="bw-body">
        <CommitGraph
          commits={commits}
          refs={graph.refsAt(day).filter((r) => shownIds.has(r.at))}
          laneColor={laneColorFor(plan)}
          spacing={SPACING}
          laneLabel={graph.laneLabel}
          messageFit="truncate"
          className="bw-graph"
          overlay={(at) =>
            commits
              .filter((c) => c.conflicts > 0)
              .map((c) => {
                const p = at(c.id);
                return p ? (
                  <g key={c.id} className="bw-badge">
                    <circle cx={p.x + 13} cy={p.y - 13} r={BADGE_R} />
                    <text x={p.x + 13} y={p.y - 9.5} textAnchor="middle">
                      {c.conflicts}
                    </text>
                  </g>
                ) : null;
              })
          }
        />
        <dl className="bw-stats">
          <div className={conflicts ? 'is-bad' : ''}>
            <dt>Conflicts so far</dt>
            <dd>
              <AnimatedValue value={conflicts} variant="pop" />
            </dd>
          </div>
          <div>
            <dt>Commit → production</dt>
            <dd>{plan.outcome.leadTime.toFixed(1)} days avg</dd>
          </div>
          <div>
            <dt>Integrates</dt>
            <dd>{ciVerdict}</dd>
          </div>
          <div>
            <dt>Typical PR</dt>
            <dd>~{plan.outcome.prLines} lines</dd>
          </div>
        </dl>
      </div>
    </Box>
  );
}
