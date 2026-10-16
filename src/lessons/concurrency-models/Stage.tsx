import { useScenePicker } from '../../components/ScenePicker';
import { RunScene } from './RunScene';
import type { Scene } from './openings';
import './styles.css';

const SCENE_OPTIONS: { value: Scene; label: string }[] = [
  { value: 'normal', label: 'A normal run' },
  { value: 'slow', label: 'One slow handler' },
  { value: 'crash', label: 'One crash' },
];

export function Stage() {
  const [scene, picker, setScene] = useScenePicker<Scene>({ label: 'Scene', options: SCENE_OPTIONS, initial: 'normal' });
  // Each scene has its own key so React never carries one scene's state into another.
  if (scene === 'slow') return <RunScene key={scene} scene={scene} picker={picker} setScene={setScene} />;
  if (scene === 'crash') return <RunScene key={scene} scene={scene} picker={picker} setScene={setScene} />;
  return <RunScene key={scene} scene={scene} picker={picker} setScene={setScene} />;
}
