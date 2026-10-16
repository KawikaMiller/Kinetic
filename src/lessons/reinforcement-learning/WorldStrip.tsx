import { Button, Hint } from '../../components/ui';
import { worldSummary } from './captions';
import { DEFAULT_WORLD, isDefaultWorld, type World } from './world';

/** Which world the scene trains in (the one painted in "The world"), with the way back to the default. */
export function WorldStrip({ world, setWorld }: { world: World; setWorld: (w: World) => void }) {
  const edited = !isDefaultWorld(world);
  return (
    <div className="rl-world">
      <Hint tone="muted">{edited ? <b>{worldSummary(world)}</b> : worldSummary(world)}</Hint>
      <Button softDisabled={!edited} onClick={() => setWorld(DEFAULT_WORLD)}>Reset the world</Button>
    </div>
  );
}
