import { useScenePicker } from '../../components/ScenePicker';
import { DetailScene } from './DetailScene';
import { HybridScene } from './HybridScene';
import { PullScene } from './PullScene';
import { PushScene } from './PushScene';
import './styles.css';

type Scene = 'push' | 'pull' | 'hybrid' | 'details';
const SCENES: { value: Scene; label: string }[] = [
  { value: 'push', label: 'Push: fan-out on write' },
  { value: 'pull', label: 'Pull: fan-out on read' },
  { value: 'hybrid', label: 'The hybrid' },
  { value: 'details', label: 'Details that bite' },
];

export function Stage() {
  const [scene, picker] = useScenePicker<Scene>({ label: 'Scene', options: SCENES, initial: 'push' });
  if (scene === 'pull') return <PullScene key={scene} picker={picker} />;
  if (scene === 'hybrid') return <HybridScene key={scene} picker={picker} />;
  if (scene === 'details') return <DetailScene key={scene} picker={picker} />;
  return <PushScene key={scene} picker={picker} />;
}
