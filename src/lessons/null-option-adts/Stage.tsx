import { useScenePicker } from '../../components/ScenePicker';
import { ChainScene } from './ChainScene';
import { MatchScene } from './MatchScene';
import { NarrowScene } from './NarrowScene';
import './styles.css';

const SCENES = [
  { value: 'chain', label: 'Null' },
  { value: 'narrow', label: 'Narrowing' },
  { value: 'match', label: 'Sum types' },
] as const;

type Scene = (typeof SCENES)[number]['value'];

export function Stage() {
  const [scene, picker] = useScenePicker<Scene>({ label: 'Scene', options: [...SCENES], initial: 'chain' });
  if (scene === 'narrow') return <NarrowScene picker={picker} />;
  if (scene === 'match') return <MatchScene picker={picker} />;
  return <ChainScene picker={picker} />;
}
