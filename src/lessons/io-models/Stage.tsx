import { useScenePicker } from '../../components/ScenePicker';
import { FilesScene } from './FilesScene';
import { ModelsScene } from './ModelsScene';
import { TraceScene } from './TraceScene';
import { TriggerScene } from './TriggerScene';
import './styles.css';

type Scene = 'models' | 'trace' | 'trigger' | 'files';
const SCENES: { value: Scene; label: string }[] = [
  { value: 'models', label: 'One server, five models' },
  { value: 'trace', label: 'An strace of an echo server' },
  { value: 'trigger', label: 'Level and edge triggering' },
  { value: 'files', label: 'Readiness, completion and files' },
];

export function Stage() {
  const [scene, picker] = useScenePicker<Scene>({ label: 'Scene', options: SCENES, initial: 'models' });
  if (scene === 'trace') return <TraceScene key={scene} picker={picker} />;
  if (scene === 'trigger') return <TriggerScene key={scene} picker={picker} />;
  if (scene === 'files') return <FilesScene key={scene} picker={picker} />;
  return <ModelsScene key={scene} picker={picker} />;
}
