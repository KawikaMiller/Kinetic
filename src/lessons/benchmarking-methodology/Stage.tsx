import { useScenePicker } from '../../components/ScenePicker';
import { NoiseScene } from './NoiseScene';
import { OmissionScene } from './OmissionScene';
import { WarmupScene } from './WarmupScene';
import './styles.css';

type Scene = 'warmup' | 'noise' | 'omission';
const SCENES: { value: Scene; label: string }[] = [
  { value: 'warmup', label: 'Warm-up' },
  { value: 'noise', label: 'Noise and intervals' },
  { value: 'omission', label: 'Coordinated omission' },
];

export function Stage() {
  const [scene, picker] = useScenePicker<Scene>({ label: 'Scene', options: SCENES, initial: 'warmup' });
  if (scene === 'noise') return <NoiseScene picker={picker} />;
  if (scene === 'omission') return <OmissionScene picker={picker} />;
  return <WarmupScene picker={picker} />;
}
