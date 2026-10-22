import { useScenePicker } from '../../components/ScenePicker';
import { ChangeScene } from './ChangeScene';
import { EnumScene } from './EnumScene';
import { MatrixScene } from './MatrixScene';
import { MixedScene } from './MixedScene';
import './styles.css';

type Scene = 'matrix' | 'mixed' | 'every' | 'change';
const SCENES: { value: Scene; label: string }[] = [
  { value: 'matrix', label: 'The matrix' },
  { value: 'mixed', label: 'Mixed strategies' },
  { value: 'every', label: 'Does every game have one?' },
  { value: 'change', label: 'Change the game' },
];

export function Stage() {
  const [scene, picker] = useScenePicker<Scene>({ label: 'Scene', options: SCENES, initial: 'matrix' });
  if (scene === 'mixed') return <MixedScene key="mixed" picker={picker} />;
  if (scene === 'every') return <EnumScene key="every" picker={picker} />;
  if (scene === 'change') return <ChangeScene key="change" picker={picker} />;
  return <MatrixScene key="matrix" picker={picker} />;
}
