import { useScenePicker } from '../../components/ScenePicker';
import { ForkScene } from './ForkScene';
import { GrainScene } from './GrainScene';
import { PoolScene } from './PoolScene';
import { StarveScene } from './StarveScene';
import './styles.css';

type Scene = 'pool' | 'fork' | 'grain' | 'starve';
const SCENES: { value: Scene; label: string }[] = [
  { value: 'pool', label: 'Pool sizing' },
  { value: 'fork', label: 'Fork-join and stealing' },
  { value: 'grain', label: 'Grain size' },
  { value: 'starve', label: 'Starvation' },
];

export function Stage() {
  const [scene, picker] = useScenePicker<Scene>({ label: 'Scene', options: SCENES, initial: 'pool' });
  // Each scene has its own key so React never carries one scene's state into another.
  if (scene === 'fork') return <ForkScene key={scene} picker={picker} />;
  if (scene === 'grain') return <GrainScene key={scene} picker={picker} />;
  if (scene === 'starve') return <StarveScene key={scene} picker={picker} />;
  return <PoolScene key={scene} picker={picker} />;
}
