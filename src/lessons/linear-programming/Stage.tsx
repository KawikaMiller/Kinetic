import { useScenePicker } from '../../components/ScenePicker';
import { IntegerScene } from './IntegerScene';
import { RegionScene } from './RegionScene';
import { SimplexScene } from './SimplexScene';
import './styles.css';

type Scene = 'region' | 'simplex' | 'integer';
const SCENES: { value: Scene; label: string }[] = [
  { value: 'region', label: 'The region' },
  { value: 'simplex', label: 'One simplex step' },
  { value: 'integer', label: 'Whole numbers' },
];

export function Stage() {
  const [scene, picker] = useScenePicker<Scene>({ label: 'Scene', options: SCENES, initial: 'region' });
  if (scene === 'simplex') return <SimplexScene key="simplex" picker={picker} />;
  if (scene === 'integer') return <IntegerScene key="integer" picker={picker} />;
  return <RegionScene key="region" picker={picker} />;
}
