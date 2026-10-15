import { useScenePicker } from '../../components/ScenePicker';
import { FleetScene } from './FleetScene';
import { IntervalScene } from './IntervalScene';
import { RuleScene } from './RuleScene';
import './styles.css';

type Scene = 'rule' | 'fleet' | 'interval';
const SCENES: { value: Scene; label: string }[] = [
  { value: 'rule', label: 'Read it off the CDF' },
  { value: 'fleet', label: 'Never average your p99s' },
  { value: 'interval', label: 'Sampling and intervals' },
];

export function Stage() {
  const [scene, picker] = useScenePicker<Scene>({ label: 'Scene', options: SCENES, initial: 'rule' });
  if (scene === 'fleet') return <FleetScene picker={picker} />;
  if (scene === 'interval') return <IntervalScene picker={picker} />;
  return <RuleScene picker={picker} />;
}
