import { useScenePicker } from '../../components/ScenePicker';
import { AssignScene } from './AssignScene';
import { BreakScene } from './BreakScene';
import { BuildScene } from './BuildScene';
import { CoverScene } from './CoverScene';
import { NoSolutionScene } from './NoSolutionScene';
import { useFormula } from './useFormula';
import './styles.css';

type Scene = 'build' | 'assign' | 'cover' | 'unsat' | 'break';
const SCENES: { value: Scene; label: string }[] = [
  { value: 'build', label: 'Build the graph' },
  { value: 'assign', label: 'Assignment to cover' },
  { value: 'cover', label: 'Cover to assignment' },
  { value: 'unsat', label: 'No solution' },
  { value: 'break', label: 'Break the reduction' },
];

export function Stage() {
  const [scene, picker] = useScenePicker<Scene>({ label: 'Scene', options: SCENES, initial: 'build' });
  const formula = useFormula();
  if (scene === 'assign') return <AssignScene key="assign" picker={picker} f={formula} />;
  if (scene === 'cover') return <CoverScene key="cover" picker={picker} f={formula} />;
  if (scene === 'unsat') return <NoSolutionScene key="unsat" picker={picker} />;
  if (scene === 'break') return <BreakScene key="break" picker={picker} f={formula} />;
  return <BuildScene key="build" picker={picker} f={formula} />;
}
