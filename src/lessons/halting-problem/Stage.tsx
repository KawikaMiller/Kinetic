import { useScenePicker } from '../../components/ScenePicker';
import { DiagonalScene } from './DiagonalScene';
import { LimitsScene } from './LimitsScene';
import { PredictorScene } from './PredictorScene';
import { RiceScene } from './RiceScene';
import './styles.css';

const SCENES = [
  { value: 'diagonal', label: 'The diagonal table' },
  { value: 'predictor', label: 'Defeat your predictor' },
  { value: 'rice', label: 'Rice’s theorem, sorted' },
  { value: 'limits', label: 'What it does not say' },
] as const;

export function Stage() {
  const [scene, picker] = useScenePicker({ label: 'Scene', options: [...SCENES], initial: 'diagonal' });
  if (scene === 'predictor') return <PredictorScene picker={picker} />;
  if (scene === 'rice') return <RiceScene picker={picker} />;
  if (scene === 'limits') return <LimitsScene picker={picker} />;
  return <DiagonalScene picker={picker} />;
}
