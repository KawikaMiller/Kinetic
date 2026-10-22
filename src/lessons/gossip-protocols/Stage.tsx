import { useScenePicker } from '../../components/ScenePicker';
import { MembershipScene } from './MembershipScene';
import { SpreadScene } from './SpreadScene';
import { TheoryScene } from './TheoryScene';
import './styles.css';

type Scene = 'spread' | 'theory' | 'membership';
const SCENES: { value: Scene; label: string }[] = [
  { value: 'spread', label: 'A rumour spreads' },
  { value: 'theory', label: 'Push, pull and log n' },
  { value: 'membership', label: 'Membership by rumour' },
];

export function Stage() {
  const [scene, picker] = useScenePicker<Scene>({ label: 'Scene', options: SCENES, initial: 'spread' });
  if (scene === 'theory') return <TheoryScene key={scene} picker={picker} />;
  if (scene === 'membership') return <MembershipScene key={scene} picker={picker} />;
  return <SpreadScene key={scene} picker={picker} />;
}
