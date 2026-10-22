import { useScenePicker } from '../../components/ScenePicker';
import { AdapterScene } from './AdapterScene';
import { FloorScene } from './FloorScene';
import { QuantScene } from './QuantScene';
import './styles.css';

type Scene = 'adapter' | 'floor' | 'quant';
const SCENES: { value: Scene; label: string }[] = [
  { value: 'adapter', label: 'A small adapter' },
  { value: 'floor', label: 'The best rank-r update' },
  { value: 'quant', label: 'Snap to a coarser grid' },
];

export function Stage() {
  const [scene, picker] = useScenePicker<Scene>({ label: 'Scene', options: SCENES, initial: 'adapter' });
  // Each scene has its own key so React never carries one scene's state into another.
  if (scene === 'floor') return <FloorScene key={scene} picker={picker} />;
  if (scene === 'quant') return <QuantScene key={scene} picker={picker} />;
  return <AdapterScene key={scene} picker={picker} />;
}
