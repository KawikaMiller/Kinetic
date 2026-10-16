import { useScenePicker } from '../../components/ScenePicker';
import { DirectionScene } from './DirectionScene';
import { FermatScene } from './FermatScene';
import { ReduceScene } from './ReduceScene';
import { SquareScene } from './SquareScene';
import { TimingScene } from './TimingScene';
import './styles.css';

type Scene = 'square' | 'reduce' | 'direction' | 'fermat' | 'timing';
const SCENES: { value: Scene; label: string }[] = [
  { value: 'square', label: 'Square and multiply' },
  { value: 'reduce', label: 'Why reduce' },
  { value: 'direction', label: 'Two directions' },
  { value: 'fermat', label: 'The same trick elsewhere' },
  { value: 'timing', label: 'A note on timing' },
];

export function Stage() {
  const [scene, picker] = useScenePicker<Scene>({ label: 'Scene', options: SCENES, initial: 'square' });
  if (scene === 'reduce') return <ReduceScene key="reduce" picker={picker} />;
  if (scene === 'direction') return <DirectionScene key="direction" picker={picker} />;
  if (scene === 'fermat') return <FermatScene key="fermat" picker={picker} />;
  if (scene === 'timing') return <TimingScene key="timing" picker={picker} />;
  return <SquareScene key="square" picker={picker} />;
}
