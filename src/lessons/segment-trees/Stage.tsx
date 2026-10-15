import { useScenePicker } from '../../components/ScenePicker';
import { ChooserScene } from './ChooserScene';
import { CostScene } from './CostScene';
import { FenwickScene } from './FenwickScene';
import { TreeScene } from './TreeScene';
import './styles.css';

type Scene = 'cost' | 'tree' | 'lazy' | 'fenwick' | 'pick';
const SCENES: { value: Scene; label: string }[] = [
  { value: 'cost', label: 'Why prefix sums stop' },
  { value: 'tree', label: 'The segment tree' },
  { value: 'lazy', label: 'Lazy range updates' },
  { value: 'fenwick', label: 'The Fenwick tree' },
  { value: 'pick', label: 'Pick the structure' },
];

export function Stage() {
  const [scene, picker] = useScenePicker<Scene>({ label: 'Scene', options: SCENES, initial: 'cost' });
  if (scene === 'tree') return <TreeScene picker={picker} mode="basic" />;
  if (scene === 'lazy') return <TreeScene picker={picker} mode="lazy" />;
  if (scene === 'fenwick') return <FenwickScene picker={picker} />;
  if (scene === 'pick') return <ChooserScene picker={picker} />;
  return <CostScene picker={picker} />;
}
