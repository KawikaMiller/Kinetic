import { useScenePicker } from '../../components/ScenePicker';
import { CycleScene } from './CycleScene';
import { DecideScene } from './DecideScene';
import { EscapeScene } from './EscapeScene';
import './styles.css';

type Scene = 'decide' | 'cycle' | 'escape';
const SCENES: { value: Scene; label: string }[] = [
  { value: 'decide', label: 'Decide on one round of news' },
  { value: 'cycle', label: 'A safe protocol that does not terminate' },
  { value: 'escape', label: 'Escape hatches' },
];

export function Stage() {
  const [scene, picker] = useScenePicker<Scene>({ label: 'Scene', options: SCENES, initial: 'decide' });
  if (scene === 'cycle') return <CycleScene key="cycle" picker={picker} />;
  if (scene === 'escape') return <EscapeScene key="escape" picker={picker} />;
  return <DecideScene key="decide" picker={picker} />;
}
