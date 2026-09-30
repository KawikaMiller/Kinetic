import { useScenePicker } from '../../components/ScenePicker';
import { BlockDemo } from './BlockDemo';
import { StepThrough } from './StepThrough';
import './styles.css';

const DEMOS = [
  { value: 'step', label: 'Step through code' },
  { value: 'block', label: 'Block the loop' },
] as const;

type Demo = (typeof DEMOS)[number]['value'];

export function Stage() {
  const [demo, picker] = useScenePicker<Demo>({ label: 'Demo', options: [...DEMOS], initial: 'step' });
  return demo === 'step' ? <StepThrough picker={picker} /> : <BlockDemo picker={picker} />;
}
