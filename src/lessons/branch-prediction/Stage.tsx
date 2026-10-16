import { useScenePicker } from '../../components/ScenePicker';
import { LabScene } from './LabScene';
import { SortedScene } from './SortedScene';
import { SpeculationScene } from './SpeculationScene';
import './styles.css';

type Scene = 'lab' | 'sorted' | 'speculation';
const SCENES: { value: Scene; label: string }[] = [
  { value: 'lab', label: 'Predictor lab' },
  { value: 'sorted', label: 'Sorted versus unsorted' },
  { value: 'speculation', label: 'Speculation and the flush' },
];

export function Stage() {
  const [scene, picker] = useScenePicker<Scene>({ label: 'Scene', options: SCENES, initial: 'lab' });
  if (scene === 'sorted') return <SortedScene key={scene} picker={picker} />;
  if (scene === 'speculation') return <SpeculationScene key={scene} picker={picker} />;
  return <LabScene key={scene} picker={picker} />;
}
