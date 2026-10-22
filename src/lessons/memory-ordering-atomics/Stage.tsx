import { useScenePicker } from '../../components/ScenePicker';
import { BitesScene, BufferingScene, PassingScene } from './Scenes';
import './styles.css';

type Scene = 'sb' | 'mp' | 'bites';
const SCENES: { value: Scene; label: string }[] = [
  { value: 'sb', label: 'Store buffering' },
  { value: 'mp', label: 'Message passing' },
  { value: 'bites', label: 'Where it bites' },
];

export function Stage() {
  const [scene, picker] = useScenePicker<Scene>({ label: 'Scene', options: SCENES, initial: 'sb' });
  if (scene === 'mp') return <PassingScene key="mp" picker={picker} />;
  if (scene === 'bites') return <BitesScene key="bites" picker={picker} />;
  return <BufferingScene key="sb" picker={picker} />;
}
