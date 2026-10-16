import { useState, type ReactNode } from 'react';
import { Box, SectionTitle } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { Button, Hint, Legend, Provenance, ProvenanceRow, Segmented, Slider, Stat, Stats } from '../../components/ui';
import { worldCaption } from './captions';
import { RlGrid } from './RlGrid';
import { WORLD_BRUSH } from './settings';
import { BRUSHES, DEFAULT_WORLD, SLIP_MAX, STEP_COST_MAX, goalReachable, hasGoal, paint, type Brush, type World } from './world';

const BRUSH_OPTIONS = BRUSHES.map((b) => ({ value: b, label: b }));

export function WorldScene({ picker, world, setWorld }: { picker: ReactNode; world: World; setWorld: (w: World) => void }) {
  const [brush, setBrush] = useState<Brush>(WORLD_BRUSH);
  const [refusal, setRefusal] = useState<string | null>(null);
  const caption = worldCaption(world);
  const press = (r: number, c: number) => {
    const result = paint(world, r, c, brush);
    if (result.ok) {
      setRefusal(null);
      setWorld(result.world);
    } else {
      setRefusal(result.error);
    }
  };
  const edited = world.rows.join() !== DEFAULT_WORLD.rows.join() || world.slip !== DEFAULT_WORLD.slip || world.stepCost !== DEFAULT_WORLD.stepCost;

  return (
    <StageFrame
      height={420}
      intro={caption}
      introKey={caption}
      stats={
        <Stats>
          <Stat label="Goal reachable" value={!hasGoal(world) ? 'no goal' : goalReachable(world) ? 'yes' : 'no'} color={hasGoal(world) && goalReachable(world) ? 'var(--ok)' : 'var(--bad)'} sub="by a path from the start, around walls" />
          <Stat label="Slip" value={`${Math.round(world.slip * 100)}%`} sub="a move goes sideways this often" />
          <Stat label="Step cost" value={world.stepCost.toFixed(2)} sub="paid on every step" />
        </Stats>
      }
      legend={
        <Legend
          items={[
            { color: 'var(--ok)', label: 'goal, +1', shape: 'square' },
            { color: 'var(--bad)', label: 'pit, -1', shape: 'square' },
            { color: 'var(--hi)', label: 'cookie, +0.3', shape: 'square' },
            { color: 'var(--dim)', label: 'wall', shape: 'square' },
          ]}
        />
      }
      controls={[
        <>
          {picker}
          <Segmented label="Paint with" value={brush} onChange={setBrush} options={BRUSH_OPTIONS} />
          <Button softDisabled={!edited} onClick={() => { setRefusal(null); setWorld(DEFAULT_WORLD); }}>Reset the world</Button>
        </>,
        <>
          <Slider label="Slip" value={Math.round(world.slip * 100)} min={0} max={SLIP_MAX * 100} step={5} onChange={(v) => setWorld({ ...world, slip: v / 100 })} format={(v) => `${v}%`} />
          <Slider label="Step cost" value={world.stepCost} min={0} max={STEP_COST_MAX} step={0.01} onChange={(v) => setWorld({ ...world, stepCost: Math.round(v * 100) / 100 })} format={(v) => v.toFixed(2)} />
        </>,
      ]}
    >
      <div className="rl-stage stage-pad">
        <Box>
          <SectionTitle hint="click a cell to paint it; S is the start and stays put">A grid world you can change</SectionTitle>
          <RlGrid view={{ world }} onCellClick={press} ariaLabel="Grid world: 5 rows by 6 columns" />
          {refusal && <p role="alert" className="rl-note">{refusal}</p>}
          <Hint tone="muted" block>The goal and the pit end an episode, and so does the cookie: a small reward close by, to tempt the agent. Painting a wall that cuts off every goal is allowed, and the lesson says so.</Hint>
        </Box>
        <ProvenanceRow>
          <Provenance kind="toy">a tabular toy world: the agent learns a table, not a neural network</Provenance>
          <Provenance kind="illustrative">the rewards, slip and step cost are illustrative numbers</Provenance>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}
