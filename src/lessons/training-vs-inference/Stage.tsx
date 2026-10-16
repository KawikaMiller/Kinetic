import { useScenePicker } from '../../components/ScenePicker';
import { CheckpointScene } from './CheckpointScene';
import { LoopScene } from './LoopScene';
import { MemoryScene } from './MemoryScene';
import { ServingScene } from './ServingScene';
import { SkewScene } from './SkewScene';
import './styles.css';

type Scene = 'loops' | 'memory' | 'serving' | 'skew' | 'checkpoints';
const SCENES: { value: Scene; label: string }[] = [
  { value: 'loops', label: 'Two loops' },
  { value: 'memory', label: 'Memory and compute' },
  { value: 'serving', label: 'Dynamic batching' },
  { value: 'skew', label: 'Train-serve skew' },
  { value: 'checkpoints', label: 'Checkpoints' },
];

export function Stage() {
  const [scene, picker] = useScenePicker<Scene>({ label: 'Scene', options: SCENES, initial: 'loops' });
  // Each scene has its own key so React never carries one scene's state into another.
  if (scene === 'memory') return <MemoryScene key={scene} picker={picker} />;
  if (scene === 'serving') return <ServingScene key={scene} picker={picker} />;
  if (scene === 'skew') return <SkewScene key={scene} picker={picker} />;
  if (scene === 'checkpoints') return <CheckpointScene key={scene} picker={picker} />;
  return <LoopScene key={scene} picker={picker} />;
}
