import { useScenePicker } from '../../components/ScenePicker';
import { CrashPauseScene } from './CrashPauseScene';
import { PhiScene } from './PhiScene';
import { SwimScene } from './SwimScene';
import { TimeoutScene } from './TimeoutScene';
import './styles.css';

type Scene = 'timeout' | 'crash' | 'phi' | 'swim';
const SCENES: { value: Scene; label: string }[] = [
  { value: 'timeout', label: 'A timeout is a guess' },
  { value: 'crash', label: 'Crash or pause?' },
  { value: 'phi', label: 'Phi accrual' },
  { value: 'swim', label: 'SWIM, ask a friend' },
];

export function Stage() {
  const [scene, picker] = useScenePicker<Scene>({ label: 'Scene', options: SCENES, initial: 'timeout' });
  if (scene === 'crash') return <CrashPauseScene key={scene} picker={picker} />;
  if (scene === 'phi') return <PhiScene key={scene} picker={picker} />;
  if (scene === 'swim') return <SwimScene key={scene} picker={picker} />;
  return <TimeoutScene key={scene} picker={picker} />;
}
