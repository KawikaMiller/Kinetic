import { useScenePicker } from '../../components/ScenePicker';
import { CrossoverScene } from './CrossoverScene';
import { PlanScene } from './PlanScene';
import { PLAN_SCENES, type PlanSceneId } from './scenes';
import './styles.css';

type Scene = PlanSceneId | 'crossover';
const SCENES: { value: Scene; label: string }[] = [
  { value: 'tree', label: PLAN_SCENES.tree.label },
  { value: 'indexes', label: PLAN_SCENES.indexes.label },
  { value: 'crossover', label: 'The crossover' },
  { value: 'misestimate', label: PLAN_SCENES.misestimate.label },
  { value: 'sort', label: PLAN_SCENES.sort.label },
];

export function Stage() {
  const [scene, picker] = useScenePicker<Scene>({ label: 'Scene', options: SCENES, initial: 'tree' });
  if (scene === 'crossover') return <CrossoverScene picker={picker} />;
  return <PlanScene key={scene} scene={scene} picker={picker} />;
}
