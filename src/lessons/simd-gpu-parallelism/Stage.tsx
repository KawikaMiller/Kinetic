import { useScenePicker } from '../../components/ScenePicker';
import { DependenceScene } from './DependenceScene';
import { HidingScene } from './HidingScene';
import { LanesScene } from './LanesScene';
import { WarpScene } from './WarpScene';
import './styles.css';

type Scene = 'lanes' | 'dependence' | 'warp' | 'hiding';
const SCENES: { value: Scene; label: string }[] = [
  { value: 'lanes', label: 'Lanes and tails' },
  { value: 'dependence', label: 'Dependence' },
  { value: 'warp', label: 'Warp divergence' },
  { value: 'hiding', label: 'Latency hiding' },
];

export function Stage() {
  const [scene, picker] = useScenePicker<Scene>({ label: 'Scene', options: SCENES, initial: 'lanes' });
  // Each scene has its own key so React never carries one scene's state into another.
  if (scene === 'dependence') return <DependenceScene key={scene} picker={picker} />;
  if (scene === 'warp') return <WarpScene key={scene} picker={picker} />;
  if (scene === 'hiding') return <HidingScene key={scene} picker={picker} />;
  return <LanesScene key={scene} picker={picker} />;
}
