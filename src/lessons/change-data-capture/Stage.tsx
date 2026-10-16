import { useScenePicker } from '../../components/ScenePicker';
import { ReplayScene } from './ReplayScene';
import { RetentionScene } from './RetentionScene';
import { SnapshotScene } from './SnapshotScene';
import { TailScene } from './TailScene';
import './styles.css';

type Scene = 'tail' | 'replay' | 'snapshot' | 'cost';
const SCENES: { value: Scene; label: string }[] = [
  { value: 'tail', label: 'The tail' },
  { value: 'replay', label: 'Crash and replay' },
  { value: 'snapshot', label: 'Snapshot then stream' },
  { value: 'cost', label: 'What the log costs' },
];

export function Stage() {
  const [scene, picker] = useScenePicker<Scene>({ label: 'Scene', options: SCENES, initial: 'tail' });
  if (scene === 'replay') return <ReplayScene key={scene} picker={picker} />;
  if (scene === 'snapshot') return <SnapshotScene key={scene} picker={picker} />;
  if (scene === 'cost') return <RetentionScene key={scene} picker={picker} />;
  return <TailScene key={scene} picker={picker} />;
}
