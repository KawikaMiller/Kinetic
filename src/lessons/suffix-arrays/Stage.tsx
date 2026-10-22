import { useScenePicker } from '../../components/ScenePicker';
import { CostScene } from './CostScene';
import { LcpScene } from './LcpScene';
import { SearchScene } from './SearchScene';
import { SortScene } from './SortScene';
import './styles.css';

type Scene = 'sort' | 'lcp' | 'search' | 'cost';
const SCENES: { value: Scene; label: string }[] = [
  { value: 'sort', label: 'Sort the suffixes' },
  { value: 'lcp', label: 'LCP and repeats' },
  { value: 'search', label: 'Search' },
  { value: 'cost', label: 'What building costs' },
];

export function Stage() {
  const [scene, picker] = useScenePicker<Scene>({ label: 'Scene', options: SCENES, initial: 'sort' });
  if (scene === 'lcp') return <LcpScene key="lcp" picker={picker} />;
  if (scene === 'search') return <SearchScene key="search" picker={picker} />;
  if (scene === 'cost') return <CostScene key="cost" picker={picker} />;
  return <SortScene key="sort" picker={picker} />;
}
