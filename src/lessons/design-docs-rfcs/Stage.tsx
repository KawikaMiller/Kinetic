import { useScenePicker } from '../../components/ScenePicker';
import { BuildScene } from './BuildScene';
import { DecisionScene } from './DecisionScene';
import { ProposalScene } from './ProposalScene';
import './styles.css';

const SCENES = [
  { value: 'build', label: 'Build the doc' },
  { value: 'decide', label: 'Alternatives and the decision' },
  { value: 'review', label: 'Your proposal meets review' },
] as const;

export function Stage() {
  const [scene, picker] = useScenePicker({ label: 'Scene', options: [...SCENES], initial: 'build' });
  if (scene === 'decide') return <DecisionScene picker={picker} />;
  if (scene === 'review') return <ProposalScene picker={picker} />;
  return <BuildScene picker={picker} />;
}
