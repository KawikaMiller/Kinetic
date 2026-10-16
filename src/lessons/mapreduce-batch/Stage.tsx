import { useScenePicker } from '../../components/ScenePicker';
import { CombinerScene } from './CombinerScene';
import { CounterScene } from './CounterScene';
import { FailureScene } from './FailureScene';
import { FlowScene } from './FlowScene';
import { StragglerScene } from './StragglerScene';
import './styles.css';

type Scene = 'flow' | 'combiner' | 'stragglers' | 'failure' | 'counter';
const SCENES: { value: Scene; label: string }[] = [
  { value: 'flow', label: 'Word count, by hand' },
  { value: 'combiner', label: 'The combiner' },
  { value: 'stragglers', label: 'Skew and stragglers' },
  { value: 'failure', label: 'A worker dies' },
  { value: 'counter', label: 'Tasks that are not safe to re-run' },
];

export function Stage() {
  const [scene, picker] = useScenePicker<Scene>({ label: 'Scene', options: SCENES, initial: 'flow' });
  if (scene === 'combiner') return <CombinerScene key="combiner" picker={picker} />;
  if (scene === 'stragglers') return <StragglerScene key="stragglers" picker={picker} />;
  if (scene === 'failure') return <FailureScene key="failure" picker={picker} />;
  if (scene === 'counter') return <CounterScene key="counter" picker={picker} />;
  return <FlowScene key="flow" picker={picker} />;
}
