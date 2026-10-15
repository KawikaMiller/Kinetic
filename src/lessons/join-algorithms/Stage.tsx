import { useScenePicker } from '../../components/ScenePicker';
import { CostScene } from './CostScene';
import { JoinScene } from './JoinScene';
import { useTableState } from './useTableState';
import './styles.css';

type Scene = 'nested' | 'hash' | 'merge' | 'cost';
const SCENES: { value: Scene; label: string }[] = [
  { value: 'nested', label: 'Nested loop' },
  { value: 'hash', label: 'Hash join' },
  { value: 'merge', label: 'Merge join' },
  { value: 'cost', label: 'Which one, and when none' },
];

export function Stage() {
  const [scene, picker] = useScenePicker<Scene>({ label: 'Scene', options: SCENES, initial: 'nested' });
  const tables = useTableState();
  if (scene === 'cost') return <CostScene state={tables} picker={picker} />;
  return <JoinScene key={scene} kind={scene} state={tables} picker={picker} />;
}
