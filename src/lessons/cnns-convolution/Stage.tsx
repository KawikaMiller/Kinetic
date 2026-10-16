import { useScenePicker } from '../../components/ScenePicker';
import { ConvScene } from './ConvScene';
import { LearnScene } from './LearnScene';
import { PoolScene } from './PoolScene';
import { StackScene } from './StackScene';
import './styles.css';

type Scene = 'slide' | 'pool' | 'learn' | 'stack';
const SCENES: { value: Scene; label: string }[] = [
  { value: 'slide', label: 'Slide a kernel' },
  { value: 'pool', label: 'Pooling and shifting' },
  { value: 'learn', label: 'Learn a kernel' },
  { value: 'stack', label: 'Stacking' },
];

export function Stage() {
  const [scene, picker] = useScenePicker<Scene>({ label: 'Scene', options: SCENES, initial: 'slide' });
  // Each scene has its own key so React never carries one scene's state into another.
  if (scene === 'pool') return <PoolScene key={scene} picker={picker} />;
  if (scene === 'learn') return <LearnScene key={scene} picker={picker} />;
  if (scene === 'stack') return <StackScene key={scene} picker={picker} />;
  return <ConvScene key={scene} picker={picker} />;
}
