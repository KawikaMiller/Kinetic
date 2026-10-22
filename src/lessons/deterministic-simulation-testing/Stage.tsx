import { useScenePicker } from '../../components/ScenePicker';
import { ExhaustiveScene } from './ExhaustiveScene';
import { HuntScene } from './HuntScene';
import { LeakScene } from './LeakScene';
import { MoveScene } from './MoveScene';
import './styles.css';

type Scene = 'hunt' | 'move' | 'leak' | 'exhaustive';
const SCENES: { value: Scene; label: string }[] = [
  { value: 'hunt', label: 'Hunt' },
  { value: 'move', label: 'Move the fault' },
  { value: 'leak', label: 'A leak, and live chaos' },
  { value: 'exhaustive', label: 'Every schedule' },
];

export function Stage() {
  const [scene, picker] = useScenePicker<Scene>({ label: 'Scene', options: SCENES, initial: 'hunt' });
  if (scene === 'move') return <MoveScene key={scene} picker={picker} />;
  if (scene === 'leak') return <LeakScene key={scene} picker={picker} />;
  if (scene === 'exhaustive') return <ExhaustiveScene key={scene} picker={picker} />;
  return <HuntScene key={scene} picker={picker} />;
}
