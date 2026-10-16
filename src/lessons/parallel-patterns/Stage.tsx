import { useScenePicker } from '../../components/ScenePicker';
import { MapScene } from './MapScene';
import { ReduceScene } from './ReduceScene';
import { ScanScene } from './ScanScene';
import './styles.css';

type Scene = 'map' | 'reduce' | 'scan';
const SCENES: { value: Scene; label: string }[] = [
  { value: 'map', label: 'Map' },
  { value: 'reduce', label: 'Reduce' },
  { value: 'scan', label: 'Scan' },
];

export function Stage() {
  const [scene, picker] = useScenePicker<Scene>({ label: 'Pattern', options: SCENES, initial: 'map' });
  // Each scene has its own key so React never carries one scene's state into another.
  if (scene === 'reduce') return <ReduceScene key={scene} picker={picker} />;
  if (scene === 'scan') return <ScanScene key={scene} picker={picker} />;
  return <MapScene key={scene} picker={picker} />;
}
