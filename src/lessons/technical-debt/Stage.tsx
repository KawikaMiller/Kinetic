import { useScenePicker } from '../../components/ScenePicker';
import { ClassifyScene } from './ClassifyScene';
import { InterestScene } from './InterestScene';
import { PriceScene } from './PriceScene';
import './styles.css';

const SCENES = [
  { value: 'interest', label: 'Interest' },
  { value: 'price', label: 'Price your debt' },
  { value: 'classify', label: 'Classify the debt' },
] as const;

export function Stage() {
  const [scene, picker] = useScenePicker({ label: 'Scene', options: [...SCENES], initial: 'interest' });
  if (scene === 'price') return <PriceScene picker={picker} />;
  if (scene === 'classify') return <ClassifyScene picker={picker} />;
  return <InterestScene picker={picker} />;
}
