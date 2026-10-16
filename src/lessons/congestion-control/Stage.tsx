import { useScenePicker } from '../../components/ScenePicker';
import { CompareScene } from './CompareScene';
import { FairScene } from './FairScene';
import { LossScene } from './LossScene';
import { RenoScene } from './RenoScene';
import './styles.css';

type Scene = 'reno' | 'compare' | 'fair' | 'loss';
const SCENES: { value: Scene; label: string }[] = [
  { value: 'reno', label: 'Reno' },
  { value: 'compare', label: 'Three algorithms' },
  { value: 'fair', label: 'Fairness' },
  { value: 'loss', label: 'Random loss' },
];

export function Stage() {
  const [scene, picker] = useScenePicker<Scene>({ label: 'Scene', options: SCENES, initial: 'reno' });
  if (scene === 'compare') return <CompareScene key={scene} picker={picker} />;
  if (scene === 'fair') return <FairScene key={scene} picker={picker} />;
  if (scene === 'loss') return <LossScene key={scene} picker={picker} />;
  return <RenoScene key={scene} picker={picker} />;
}
