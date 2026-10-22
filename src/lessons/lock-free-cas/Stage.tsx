import { useScenePicker } from '../../components/ScenePicker';
import { CasScene } from './CasScene';
import { ProgressScene } from './ProgressScene';
import { StackScene } from './StackScene';
import './styles.css';

type Scene = 'cas' | 'stack' | 'progress';
const SCENES: { value: Scene; label: string }[] = [
  { value: 'cas', label: 'The CAS loop' },
  { value: 'stack', label: 'A lock-free stack and ABA' },
  { value: 'progress', label: 'Lock-free is not wait-free' },
];

export function Stage() {
  const [scene, picker] = useScenePicker<Scene>({ label: 'Scene', options: SCENES, initial: 'cas' });
  if (scene === 'stack') return <StackScene key="stack" picker={picker} />;
  if (scene === 'progress') return <ProgressScene key="progress" picker={picker} />;
  return <CasScene key="cas" picker={picker} />;
}
