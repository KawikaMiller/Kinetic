import { useScenePicker } from '../../components/ScenePicker';
import { BurstScene } from './BurstScene';
import { DetectScene } from './DetectScene';
import { MeltScene } from './MeltScene';
import { MitigateScene } from './MitigateScene';
import './styles.css';

type Scene = 'melt' | 'mitigate' | 'detect' | 'burst';
const SCENES: { value: Scene; label: string }[] = [
  { value: 'melt', label: 'The melt' },
  { value: 'mitigate', label: 'Mitigations' },
  { value: 'detect', label: 'Find the hot keys' },
  { value: 'burst', label: 'Hot in time' },
];

export function Stage() {
  const [scene, picker] = useScenePicker<Scene>({ label: 'Scene', options: SCENES, initial: 'melt' });
  if (scene === 'mitigate') return <MitigateScene key={scene} picker={picker} />;
  if (scene === 'detect') return <DetectScene key={scene} picker={picker} />;
  if (scene === 'burst') return <BurstScene key={scene} picker={picker} />;
  return <MeltScene key={scene} picker={picker} />;
}
