import { useScenePicker } from '../../components/ScenePicker';
import { ConvertScene } from './ConvertScene';
import { KargerScene } from './KargerScene';
import { PiScene } from './PiScene';
import { PrimalityScene } from './PrimalityScene';
import { SortScene } from './SortScene';
import './styles.css';

type Scene = 'sort' | 'pi' | 'primality' | 'convert' | 'karger';
const SCENES: { value: Scene; label: string }[] = [
  { value: 'sort', label: 'Las Vegas: quicksort' },
  { value: 'pi', label: 'Monte Carlo: pi' },
  { value: 'primality', label: 'One-sided error: primality' },
  { value: 'convert', label: 'Converting' },
  { value: 'karger', label: 'Advanced: Karger' },
];

export function Stage() {
  const [scene, picker] = useScenePicker<Scene>({ label: 'Scene', options: SCENES, initial: 'sort' });
  if (scene === 'pi') return <PiScene key="pi" picker={picker} />;
  if (scene === 'primality') return <PrimalityScene key="primality" picker={picker} />;
  if (scene === 'convert') return <ConvertScene key="convert" picker={picker} />;
  if (scene === 'karger') return <KargerScene key="karger" picker={picker} />;
  return <SortScene key="sort" picker={picker} />;
}
