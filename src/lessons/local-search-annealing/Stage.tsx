import { useScenePicker } from '../../components/ScenePicker';
import { BallScene } from './BallScene';
import { BatchScene } from './BatchScene';
import { TemperatureScene } from './TemperatureScene';
import { TwoOptScene } from './TwoOptScene';
import './styles.css';

type Scene = 'ball' | 'batch' | 'temperature' | 'twoopt';
const SCENES: { value: Scene; label: string }[] = [
  { value: 'ball', label: 'One ball' },
  { value: 'batch', label: 'Over 1,000 seeds' },
  { value: 'temperature', label: 'What temperature does' },
  { value: 'twoopt', label: '2-opt' },
];

export function Stage() {
  const [scene, picker] = useScenePicker<Scene>({ label: 'Scene', options: SCENES, initial: 'ball' });
  if (scene === 'batch') return <BatchScene key="batch" picker={picker} />;
  if (scene === 'temperature') return <TemperatureScene key="temperature" picker={picker} />;
  if (scene === 'twoopt') return <TwoOptScene key="twoopt" picker={picker} />;
  return <BallScene key="ball" picker={picker} />;
}
