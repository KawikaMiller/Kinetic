import { useMemo, useState, type ReactNode } from 'react';
import { Box, SectionTitle } from '../../components/Panel';
import { StageFrame } from '../../components/StageFrame';
import { Hint, Legend, Provenance, ProvenanceRow, Segmented, Slider, Stat, Stats } from '../../components/ui';
import { MAZE_ROWS, OPEN_ROWS, TABLE_ROWS, TD_UPDATES_MAX, approxWorld, stateCount, trainTd } from './approx';
import { approxCaption, f2 } from './captions';
import { liveStates } from './mdp';
import { RlGrid } from './RlGrid';
import { APPROX_DEFAULT } from './settings';

const WORLDS = [{ value: 'open', label: 'Open grid' }, { value: 'maze', label: 'Walled maze' }];

export function ApproxScene({ picker }: { picker: ReactNode }) {
  const [maze, setMaze] = useState<boolean>(APPROX_DEFAULT.maze);
  const [updates, setUpdates] = useState<number>(APPROX_DEFAULT.updates);
  const world = useMemo(() => approxWorld(maze ? MAZE_ROWS : OPEN_ROWS), [maze]);
  const fit = useMemo(() => trainTd(world, updates), [world, updates]);
  const start = useMemo(() => trainTd(world, 0), [world]);
  const caption = approxCaption(maze, updates, fit.rmse, start.rmse);
  // One colour scale for both grids, so an estimate that is off looks off.
  const range = useMemo(() => {
    const live = liveStates(world);
    const all = live.flatMap((s) => [fit.truth[s], fit.estimate[s]]);
    return { lo: Math.min(...all), hi: Math.max(...all) };
  }, [world, fit]);

  return (
    <StageFrame
      height={470}
      intro={caption}
      introKey={caption}
      stats={
        <Stats>
          <Stat label="Error against the true values" value={f2(fit.rmse)} color={fit.rmse > 0.05 ? 'var(--bad)' : 'var(--ok)'} sub="RMS over the free cells" />
          <Stat label="Weights" value={fit.weights.length} sub={`one vector: ${fit.weights.map(f2).join(', ')}`} />
          <Stat label="A table would need" value={world.rows.join('').length} sub="entries: one per cell" />
        </Stats>
      }
      legend={<Legend items={[{ color: 'var(--ok)', label: 'greener: higher value', shape: 'square' }, { color: 'var(--bad)', label: 'error above 0.05 RMS', shape: 'square' }]} />}
      controls={[
        <>
          {picker}
          <Segmented label="World" value={maze ? 'maze' : 'open'} onChange={(v) => setMaze(v === 'maze')} options={WORLDS} />
          <Slider label="TD updates" value={updates} min={0} max={TD_UPDATES_MAX} step={1000} onChange={setUpdates} format={(v) => v.toLocaleString('en-US')} />
        </>,
      ]}
    >
      <div className="rl-stage stage-pad">
        <div className="rl-pair">
          <Box>
            <SectionTitle hint="exact, from value iteration">True values</SectionTitle>
            <RlGrid view={{ world, values: fit.truth, range }} ariaLabel="True values of the optimal policy" />
          </Box>
          <Box>
            <SectionTitle hint="a plane over (x, y), by semi-gradient TD">Linear approximation</SectionTitle>
            <RlGrid view={{ world, values: fit.estimate, range }} ariaLabel="The linear approximation's values" />
          </Box>
        </div>
        <Hint tone="muted" block>Both grids share one colour scale. The values are those of the optimal policy found by value iteration, held fixed here. The best possible plane on this world is off by {f2(fit.planeRmse)} RMS; training after these updates is off by {f2(fit.rmse)}, and the distance between the two is training that has not finished, not the plane.
        </Hint>
        <Box>
          <SectionTitle hint="a state is the cell times 2 for every yes/no flag">How many states a table needs</SectionTitle>
          <table className="rl-table table-cards">
            <thead><tr><th>World</th><th>Cells</th><th>Flags</th><th>States</th></tr></thead>
            <tbody>
              {TABLE_ROWS.map((r) => (
                <tr key={r.label}><th scope="row">{r.label}</th><td data-label="Cells">{r.cells}</td><td data-label="Flags">{r.flags}</td><td data-label="States">{stateCount(r.cells, r.flags).toLocaleString('en-US')}</td></tr>
              ))}
            </tbody>
          </table>
          <Hint tone="muted" block>Deep Q-networks, policy gradients and learning from human feedback are named here only: they are what replaces the table when the state space is too large.</Hint>
        </Box>
        <ProvenanceRow>
          <Provenance kind="simulated">TD(0) with random starting cells on a fixed policy, computed live</Provenance>
          <Provenance kind="toy">one weight vector over (x, y): a toy function approximator, not a neural network</Provenance>
          <Provenance kind="from-memory">algorithm definitions are from memory: verify against Sutton and Barto</Provenance>
        </ProvenanceRow>
      </div>
    </StageFrame>
  );
}
