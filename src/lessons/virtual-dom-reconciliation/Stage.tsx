import { useScenePicker } from '../../components/ScenePicker';
import { RealReactScene } from './RealReact';
import { ListScene, TreeScene } from './Scenes';
import './styles.css';

type Scene = 'tree' | 'list' | 'real';
const SCENES: { value: Scene; label: string }[] = [
  { value: 'tree', label: 'Diff a tree' },
  { value: 'list', label: 'Diff a list' },
  { value: 'real', label: 'Real React' },
];

export function Stage() {
  const [scene, picker] = useScenePicker<Scene>({ label: 'Scene', options: SCENES, initial: 'tree' });
  if (scene === 'tree') return <TreeScene picker={picker} />;
  if (scene === 'list') return <ListScene picker={picker} />;
  return <RealReactScene picker={picker} />;
}
