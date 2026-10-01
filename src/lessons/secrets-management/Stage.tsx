import { useScenePicker } from '../../components/ScenePicker';
import { FixScene } from './FixScene';
import { LeakScene } from './LeakScene';
import { SortScene } from './SortScene';
import './styles.css';

type Scene = 'leak' | 'fix' | 'sort';

const SCENES: { value: Scene; label: string }[] = [
  { value: 'leak', label: '① The leak' },
  { value: 'fix', label: '② Fix it' },
  { value: 'sort', label: '③ Code, config or secret?' },
];

export function Stage() {
  const [scene, picker] = useScenePicker({ label: 'Scene', options: SCENES, initial: 'leak' });
  // Each scene owns its own StageFrame (and player), so switching remounts cleanly.
  if (scene === 'fix') return <FixScene picker={picker} />;
  if (scene === 'sort') return <SortScene picker={picker} />;
  return <LeakScene picker={picker} />;
}
