import { useScenePicker } from '../../components/ScenePicker';
import { KthScene } from './KthScene';
import { LcaScene } from './LcaScene';
import { TableScene } from './TableScene';
import { WorkScene } from './WorkScene';
import './styles.css';

type Scene = 'table' | 'kth' | 'lca' | 'work';
const SCENES: { value: Scene; label: string }[] = [
  { value: 'table', label: 'Build the table' },
  { value: 'kth', label: 'k-th ancestor' },
  { value: 'lca', label: 'LCA' },
  { value: 'work', label: 'Count the work' },
];

export function Stage() {
  const [scene, picker] = useScenePicker<Scene>({ label: 'Scene', options: SCENES, initial: 'table' });
  if (scene === 'kth') return <KthScene key="kth" picker={picker} />;
  if (scene === 'lca') return <LcaScene key="lca" picker={picker} />;
  if (scene === 'work') return <WorkScene key="work" picker={picker} />;
  return <TableScene key="table" picker={picker} />;
}
