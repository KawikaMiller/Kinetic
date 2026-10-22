import { useScenePicker } from '../../components/ScenePicker';
import { CheckScene } from './CheckScene';
import { GrowthScene } from './GrowthScene';
import { ReplayScene } from './ReplayScene';
import './styles.css';

type Scene = 'check' | 'growth' | 'replay';
const SCENES: { value: Scene; label: string }[] = [
  { value: 'check', label: 'Check a lock' },
  { value: 'growth', label: 'How big does it get' },
  { value: 'replay', label: 'Reading a counterexample' },
];

export function Stage() {
  const [scene, picker] = useScenePicker<Scene>({ label: 'Scene', options: SCENES, initial: 'check' });
  if (scene === 'growth') return <GrowthScene key="growth" picker={picker} />;
  if (scene === 'replay') return <ReplayScene key="replay" picker={picker} />;
  return <CheckScene key="check" picker={picker} />;
}
