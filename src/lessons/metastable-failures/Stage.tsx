import { useScenePicker } from '../../components/ScenePicker';
import { FixScene } from './FixScene';
import { LoopScene } from './LoopScene';
import './styles.css';

type Scene = 'loop' | 'fix';
const SCENES: { value: Scene; label: string }[] = [
  { value: 'loop', label: 'The loop' },
  { value: 'fix', label: 'What breaks the loop' },
];

export function Stage() {
  const [scene, picker] = useScenePicker<Scene>({ label: 'Scene', options: SCENES, initial: 'loop' });
  if (scene === 'fix') return <FixScene key={scene} picker={picker} />;
  return <LoopScene key={scene} picker={picker} />;
}
