import { useScenePicker } from '../../components/ScenePicker';
import { DuelScene } from './DuelScene';
import { MultiScene } from './MultiScene';
import { PoolScene } from './PoolScene';
import './styles.css';

type Scene = 'pool' | 'duel' | 'multi';
const SCENES: { value: Scene; label: string }[] = [
  { value: 'pool', label: 'Drive the scheduler' },
  { value: 'duel', label: 'Duelling proposers' },
  { value: 'multi', label: 'Multi-Paxos and quorums' },
];

export function Stage() {
  const [scene, picker] = useScenePicker<Scene>({ label: 'Scene', options: SCENES, initial: 'pool' });
  if (scene === 'duel') return <DuelScene key="duel" picker={picker} />;
  if (scene === 'multi') return <MultiScene key="multi" picker={picker} />;
  return <PoolScene key="pool" picker={picker} />;
}
