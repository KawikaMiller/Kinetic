import { useScenePicker } from '../../components/ScenePicker';
import { ChainScene } from './ChainScene';
import { KnapsackScene } from './KnapsackScene';
import { LisScene } from './LisScene';
import { TspScene } from './TspScene';
import './styles.css';

type Scene = 'knapsack' | 'lis' | 'chain' | 'tsp';
const SCENES: { value: Scene; label: string }[] = [
  { value: 'knapsack', label: '0/1 knapsack' },
  { value: 'lis', label: 'Increasing subsequence' },
  { value: 'chain', label: 'Interval DP' },
  { value: 'tsp', label: 'Bitmask DP' },
];

export function Stage() {
  const [scene, picker] = useScenePicker<Scene>({ label: 'Family', options: SCENES, initial: 'knapsack' });
  if (scene === 'lis') return <LisScene key="lis" picker={picker} />;
  if (scene === 'chain') return <ChainScene key="chain" picker={picker} />;
  if (scene === 'tsp') return <TspScene key="tsp" picker={picker} />;
  return <KnapsackScene key="knapsack" picker={picker} />;
}
