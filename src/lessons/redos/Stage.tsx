import { useScenePicker } from '../../components/ScenePicker';
import { CounterScene } from './CounterScene';
import { FixesScene } from './FixesScene';
import { OPENING_SCENE, type SceneId } from './opening';
import { ShapesScene } from './ShapesScene';
import './styles.css';

const SCENES: { value: SceneId; label: string }[] = [
  { value: 'counter', label: 'The step counter' },
  { value: 'shapes', label: 'Which shapes grow' },
  { value: 'fixes', label: 'Fixes' },
];

export function Stage() {
  const [scene, picker] = useScenePicker<SceneId>({ label: 'Scene', options: SCENES, initial: OPENING_SCENE });
  if (scene === 'shapes') return <ShapesScene key="shapes" picker={picker} />;
  if (scene === 'fixes') return <FixesScene key="fixes" picker={picker} />;
  return <CounterScene key="counter" picker={picker} />;
}
