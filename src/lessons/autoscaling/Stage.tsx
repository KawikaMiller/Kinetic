import { useScenePicker } from '../../components/ScenePicker';
import { BillScene } from './BillScene';
import { PolicyScene } from './PolicyScene';
import { ReactiveScene } from './ReactiveScene';
import './styles.css';

type Scene = 'reactive' | 'policy' | 'bill';
const SCENES: { value: Scene; label: string }[] = [
  { value: 'reactive', label: 'A reactive loop' },
  { value: 'policy', label: 'Scheduled and predictive' },
  { value: 'bill', label: 'The bill' },
];

export function Stage() {
  const [scene, picker] = useScenePicker<Scene>({ label: 'Scene', options: SCENES, initial: 'reactive' });
  if (scene === 'policy') return <PolicyScene picker={picker} />;
  if (scene === 'bill') return <BillScene picker={picker} />;
  return <ReactiveScene picker={picker} />;
}
