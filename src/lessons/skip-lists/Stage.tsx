import { useScenePicker } from '../../components/ScenePicker';
import { CostScene } from './CostScene';
import { InsertScene } from './InsertScene';
import { SearchScene } from './SearchScene';
import { WhyScene } from './WhyScene';
import './styles.css';

type Scene = 'search' | 'insert' | 'cost' | 'why';
const SCENES: { value: Scene; label: string }[] = [
  { value: 'search', label: 'Search with express lanes' },
  { value: 'insert', label: 'Insert with coin flips' },
  { value: 'cost', label: 'Is it really log n?' },
  { value: 'why', label: 'Why use one?' },
];

export function Stage() {
  const [scene, picker] = useScenePicker<Scene>({ label: 'Scene', options: SCENES, initial: 'search' });
  if (scene === 'insert') return <InsertScene picker={picker} />;
  if (scene === 'cost') return <CostScene picker={picker} />;
  if (scene === 'why') return <WhyScene picker={picker} />;
  return <SearchScene picker={picker} />;
}
