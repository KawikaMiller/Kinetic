import { useScenePicker } from '../../components/ScenePicker';
import { ChainScene } from './ChainScene';
import { useWorkbench } from './useWorkbench';
import { Workbench } from './Workbench';
import './styles.css';

type Scene = 'versions' | 'vacuum' | 'chain';
const SCENES: { value: Scene; label: string }[] = [
  { value: 'versions', label: 'Version chains and snapshots' },
  { value: 'vacuum', label: 'Vacuum and the long transaction' },
  { value: 'chain', label: 'Why UPDATE copies' },
];

export function Stage() {
  const [scene, picker] = useScenePicker<Scene>({ label: 'Scene', options: SCENES, initial: 'versions' });
  const wb = useWorkbench();
  if (scene === 'chain') return <ChainScene picker={picker} />;
  return <Workbench scene={scene} wb={wb} picker={picker} />;
}
