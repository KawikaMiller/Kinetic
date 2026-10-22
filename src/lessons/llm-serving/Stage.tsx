import { useScenePicker } from '../../components/ScenePicker';
import { BatchScene } from './BatchScene';
import { CacheScene } from './CacheScene';
import { RequestScene } from './RequestScene';
import './styles.css';

type Scene = 'request' | 'cache' | 'batching';
const SCENES: { value: Scene; label: string }[] = [
  { value: 'request', label: 'One request' },
  { value: 'cache', label: 'The KV cache' },
  { value: 'batching', label: 'Batching' },
];

export function Stage() {
  const [scene, picker] = useScenePicker<Scene>({ label: 'Scene', options: SCENES, initial: 'request' });
  // Each scene has its own key so React never carries one scene's state into another.
  if (scene === 'cache') return <CacheScene key={scene} picker={picker} />;
  if (scene === 'batching') return <BatchScene key={scene} picker={picker} />;
  return <RequestScene key={scene} picker={picker} />;
}
