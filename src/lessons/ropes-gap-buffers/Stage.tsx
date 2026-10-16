import { useScenePicker } from '../../components/ScenePicker';
import { ArrayScene } from './ArrayScene';
import { GapScene } from './GapScene';
import { RopeScene } from './RopeScene';
import { WorkloadScene } from './WorkloadScene';
import './styles.css';

type Scene = 'array' | 'gap' | 'rope' | 'workload';
const SCENES: { value: Scene; label: string }[] = [
  { value: 'array', label: 'The plain array' },
  { value: 'gap', label: 'The gap buffer' },
  { value: 'rope', label: 'The rope' },
  { value: 'workload', label: 'Pick a workload' },
];

export function Stage() {
  const [scene, picker] = useScenePicker<Scene>({ label: 'Scene', options: SCENES, initial: 'array' });
  if (scene === 'gap') return <GapScene key="gap" picker={picker} />;
  if (scene === 'rope') return <RopeScene key="rope" picker={picker} />;
  if (scene === 'workload') return <WorkloadScene key="workload" picker={picker} />;
  return <ArrayScene key="array" picker={picker} />;
}
