import { useScenePicker } from '../../components/ScenePicker';
import { BoundScene } from './BoundScene';
import { GreedyScene } from './GreedyScene';
import { HardScene } from './HardScene';
import { TimetableScene } from './TimetableScene';
import { useColorEditor } from './useColorEditor';
import './styles.css';

type Scene = 'greedy' | 'bound' | 'timetable' | 'hard';
const SCENES: { value: Scene; label: string }[] = [
  { value: 'greedy', label: 'Greedy, in your order' },
  { value: 'bound', label: 'The bound' },
  { value: 'timetable', label: 'Timetable' },
  { value: 'hard', label: 'Why it is hard' },
];

export function Stage() {
  const [scene, picker] = useScenePicker<Scene>({ label: 'Scene', options: SCENES, initial: 'greedy' });
  const ed = useColorEditor(scene);
  if (scene === 'bound') return <BoundScene picker={picker} ed={ed} />;
  if (scene === 'timetable') return <TimetableScene picker={picker} />;
  if (scene === 'hard') return <HardScene picker={picker} ed={ed} />;
  return <GreedyScene picker={picker} ed={ed} />;
}
