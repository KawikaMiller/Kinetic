import { useScenePicker } from '../../components/ScenePicker';
import { HeuristicScene } from './HeuristicScene';
import { PackagesScene } from './PackagesScene';
import { PropagateScene } from './PropagateScene';
import { WindowScene } from './WindowScene';
import './styles.css';

type Scene = 'propagate' | 'heuristic' | 'window' | 'packages';
const SCENES: { value: Scene; label: string }[] = [
  { value: 'propagate', label: 'Propagate' },
  { value: 'heuristic', label: 'You are the heuristic' },
  { value: 'window', label: 'Over 200 formulas' },
  { value: 'packages', label: 'Package resolution' },
];

export function Stage() {
  const [scene, picker] = useScenePicker<Scene>({ label: 'Scene', options: SCENES, initial: 'propagate' });
  if (scene === 'heuristic') return <HeuristicScene key="heuristic" picker={picker} />;
  if (scene === 'window') return <WindowScene key="window" picker={picker} />;
  if (scene === 'packages') return <PackagesScene key="packages" picker={picker} />;
  return <PropagateScene key="propagate" picker={picker} />;
}
