import { useScenePicker } from '../../components/ScenePicker';
import { ActionsScene } from './ActionsScene';
import { BlameScene } from './BlameScene';
import { FactorsScene } from './FactorsScene';
import { WhysScene } from './WhysScene';
import './styles.css';

const SCENES = [
  { value: 'factors', label: 'The factors tree' },
  { value: 'blame', label: 'Blame to system' },
  { value: 'actions', label: 'Action items' },
  { value: 'whys', label: 'Whys vs a tree' },
] as const;

export function Stage() {
  const [scene, picker] = useScenePicker({ label: 'Scene', options: [...SCENES], initial: 'factors' });
  if (scene === 'blame') return <BlameScene picker={picker} />;
  if (scene === 'actions') return <ActionsScene picker={picker} />;
  if (scene === 'whys') return <WhysScene picker={picker} />;
  return <FactorsScene picker={picker} />;
}
