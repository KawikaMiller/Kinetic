import { useScenePicker } from '../../components/ScenePicker';
import { DedupeScene } from './DedupeScene';
import { DeliveryScene } from './DeliveryScene';
import { GeneralsScene } from './GeneralsScene';
import { ScopesScene } from './ScopesScene';
import './styles.css';

type Scene = 'generals' | 'delivery' | 'dedupe' | 'scopes';
const SCENES: { value: Scene; label: string }[] = [
  { value: 'generals', label: 'Two Generals' },
  { value: 'delivery', label: 'Delivery on a lossy link' },
  { value: 'dedupe', label: 'At least once plus dedup' },
  { value: 'scopes', label: 'Advanced: where it is true' },
];

export function Stage() {
  const [scene, picker] = useScenePicker<Scene>({ label: 'Scene', options: SCENES, initial: 'generals' });
  if (scene === 'delivery') return <DeliveryScene picker={picker} />;
  if (scene === 'dedupe') return <DedupeScene picker={picker} />;
  if (scene === 'scopes') return <ScopesScene picker={picker} />;
  return <GeneralsScene picker={picker} />;
}
