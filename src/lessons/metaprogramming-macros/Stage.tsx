import { useScenePicker } from '../../components/ScenePicker';
import { MacroScene } from './MacroScene';
import { OPENING, type SceneId } from './opening';
import { PhasesScene } from './PhasesScene';
import { ReflectionScene } from './ReflectionScene';
import './styles.css';

const SCENES: { value: SceneId; label: string }[] = [
  { value: 'macro', label: 'Expand a macro' },
  { value: 'reflection', label: 'Reflection and proxies' },
  { value: 'phases', label: 'When does it run?' },
];

export function Stage() {
  const [scene, picker] = useScenePicker<SceneId>({ label: 'Scene', options: SCENES, initial: OPENING.scene });
  if (scene === 'reflection') return <ReflectionScene key="reflection" picker={picker} />;
  if (scene === 'phases') return <PhasesScene key="phases" picker={picker} />;
  return <MacroScene key="macro" picker={picker} />;
}
