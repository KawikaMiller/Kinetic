import { useScenePicker } from '../../components/ScenePicker';
import { FaultScene } from './FaultScene';
import { LiveScene } from './LiveScene';
import { LoopScene } from './LoopScene';
import { StrategyScene } from './StrategyScene';
import './styles.css';

type Scene = 'live' | 'strategies' | 'faults' | 'loop';
const SCENES: { value: Scene; label: string }[] = [
  { value: 'live', label: 'Two devices' },
  { value: 'strategies', label: 'Conflict strategies' },
  { value: 'faults', label: 'Delivery faults' },
  { value: 'loop', label: 'The sync loop' },
];

export function Stage() {
  const [scene, picker] = useScenePicker<Scene>({ label: 'Scene', options: SCENES, initial: 'live' });
  if (scene === 'strategies') return <StrategyScene key={scene} picker={picker} />;
  if (scene === 'faults') return <FaultScene key={scene} picker={picker} />;
  if (scene === 'loop') return <LoopScene key={scene} picker={picker} />;
  return <LiveScene key={scene} picker={picker} />;
}
