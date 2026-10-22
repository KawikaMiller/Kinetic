import { useScenePicker } from '../../components/ScenePicker';
import { DataScene } from './DataScene';
import { IsolationScene } from './IsolationScene';
import { NoisyScene } from './NoisyScene';
import { ShuffleScene } from './ShuffleScene';
import './styles.css';

type Scene = 'noisy' | 'isolation' | 'shuffle' | 'data';
const SCENES: { value: Scene; label: string }[] = [
  { value: 'noisy', label: 'The noisy neighbour' },
  { value: 'isolation', label: 'Isolation' },
  { value: 'shuffle', label: 'Shuffle sharding' },
  { value: 'data', label: 'Data isolation' },
];

export function Stage() {
  const [scene, picker] = useScenePicker<Scene>({ label: 'Scene', options: SCENES, initial: 'noisy' });
  if (scene === 'isolation') return <IsolationScene key={scene} picker={picker} />;
  if (scene === 'shuffle') return <ShuffleScene key={scene} picker={picker} />;
  if (scene === 'data') return <DataScene key={scene} picker={picker} />;
  return <NoisyScene key={scene} picker={picker} />;
}
