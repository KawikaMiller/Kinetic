import { useScenePicker } from '../../components/ScenePicker';
import { CostScene } from './CostScene';
import { HeadScene } from './HeadScene';
import { HeadsScene } from './HeadsScene';
import { LookupScene } from './LookupScene';
import { ScaleScene } from './ScaleScene';
import './styles.css';

type Scene = 'head' | 'scale' | 'heads' | 'lookup' | 'cost';
const SCENES: { value: Scene; label: string }[] = [
  { value: 'head', label: 'One head' },
  { value: 'scale', label: 'Why √d_k' },
  { value: 'heads', label: 'Mask, heads, position' },
  { value: 'lookup', label: 'Learn a lookup' },
  { value: 'cost', label: 'Cost of context' },
];

export function Stage() {
  const [scene, picker] = useScenePicker<Scene>({ label: 'Scene', options: SCENES, initial: 'head' });
  // Each scene has its own key so React never carries one scene's state into another.
  if (scene === 'scale') return <ScaleScene key={scene} picker={picker} />;
  if (scene === 'heads') return <HeadsScene key={scene} picker={picker} />;
  if (scene === 'lookup') return <LookupScene key={scene} picker={picker} />;
  if (scene === 'cost') return <CostScene key={scene} picker={picker} />;
  return <HeadScene key={scene} picker={picker} />;
}
