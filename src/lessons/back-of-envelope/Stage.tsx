import { useScenePicker } from '../../components/ScenePicker';
import { GuessScene } from './GuessScene';
import { LadderScene } from './LadderScene';
import { ServerScene } from './ServerScene';
import { StorageScene } from './StorageScene';
import { TrafficScene } from './TrafficScene';
import './styles.css';

type Scene = 'traffic' | 'storage' | 'servers' | 'ladder' | 'guess';
const SCENES: { value: Scene; label: string }[] = [
  { value: 'traffic', label: 'Users to QPS' },
  { value: 'storage', label: 'Storage and bandwidth' },
  { value: 'servers', label: 'How many servers?' },
  { value: 'ladder', label: 'The latency ladder' },
  { value: 'guess', label: 'Guess first' },
];

export function Stage() {
  const [scene, picker] = useScenePicker<Scene>({ label: 'Scene', options: SCENES, initial: 'traffic' });
  if (scene === 'storage') return <StorageScene picker={picker} />;
  if (scene === 'servers') return <ServerScene picker={picker} />;
  if (scene === 'ladder') return <LadderScene picker={picker} />;
  if (scene === 'guess') return <GuessScene picker={picker} />;
  return <TrafficScene picker={picker} />;
}
