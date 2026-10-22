import { useScenePicker } from '../../components/ScenePicker';
import { PlannerScene } from './PlannerScene';
import { RulesScene } from './RulesScene';
import { TracerScene } from './TracerScene';
import './styles.css';

type Scene = 'tracer' | 'rules' | 'planner';
const SCENES: { value: Scene; label: string }[] = [
  { value: 'tracer', label: 'Trace a packet' },
  { value: 'rules', label: 'Edit the rules' },
  { value: 'planner', label: 'Plan the CIDRs' },
];

export function Stage() {
  const [scene, picker] = useScenePicker<Scene>({ label: 'Scene', options: SCENES, initial: 'tracer' });
  if (scene === 'rules') return <RulesScene key={scene} picker={picker} />;
  if (scene === 'planner') return <PlannerScene key={scene} picker={picker} />;
  return <TracerScene key={scene} picker={picker} />;
}
