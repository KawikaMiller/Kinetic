import { useScenePicker } from '../../components/ScenePicker';
import { ForecastScene } from './ForecastScene';
import { LoadScene } from './LoadScene';
import { ScaleScene } from './ScaleScene';
import './styles.css';

type Scene = 'load' | 'forecast' | 'scale';
const SCENES: { value: Scene; label: string }[] = [
  { value: 'load', label: 'A load test' },
  { value: 'forecast', label: 'Headroom and forecast' },
  { value: 'scale', label: 'What moves the knee' },
];

export function Stage() {
  const [scene, picker] = useScenePicker<Scene>({ label: 'Scene', options: SCENES, initial: 'load' });
  if (scene === 'forecast') return <ForecastScene picker={picker} />;
  if (scene === 'scale') return <ScaleScene picker={picker} />;
  return <LoadScene picker={picker} />;
}
