import { useScenePicker } from '../../components/ScenePicker';
import { AnalogyScene } from './AnalogyScene';
import { BuildScene } from './BuildScene';
import { StepperScene } from './StepperScene';
import { StrategyScene } from './StrategyScene';
import './styles.css';

const SCENES = [
  { value: 'stepper', label: 'The stepper' },
  { value: 'capture', label: 'Capture' },
  { value: 'build', label: 'Build it' },
  { value: 'strategy', label: 'Strategy matters' },
  { value: 'analogy', label: 'One notation' },
] as const;

export function Stage() {
  const [scene, picker] = useScenePicker({ label: 'Scene', options: [...SCENES], initial: 'stepper' });
  if (scene === 'capture') return <StepperScene key="capture" picker={picker} capture />;
  if (scene === 'build') return <BuildScene picker={picker} />;
  if (scene === 'strategy') return <StrategyScene picker={picker} />;
  if (scene === 'analogy') return <AnalogyScene picker={picker} />;
  return <StepperScene key="stepper" picker={picker} capture={false} />;
}
