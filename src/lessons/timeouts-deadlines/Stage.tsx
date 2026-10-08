import { useScenePicker } from '../../components/ScenePicker';
import { ChainScene } from './ChainScene';
import { PickScene } from './PickScene';
import { RetryScene } from './RetryScene';
import './styles.css';

type SceneId = 'chain' | 'retry' | 'pick';
const SCENES: { value: SceneId; label: string }[] = [
  { value: 'chain', label: 'Call chain' },
  { value: 'retry', label: 'Retries in budget' },
  { value: 'pick', label: 'Picking a timeout' },
];

export function Stage() {
  const [scene, picker] = useScenePicker({ label: 'Scene', options: SCENES, initial: 'chain' });
  if (scene === 'retry') return <RetryScene picker={picker} />;
  if (scene === 'pick') return <PickScene picker={picker} />;
  return <ChainScene picker={picker} />;
}
