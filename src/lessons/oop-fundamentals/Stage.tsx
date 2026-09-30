import { useScenePicker } from '../../components/ScenePicker';
import { Composition } from './Composition';
import { Dispatch } from './Dispatch';
import { Encapsulation } from './Encapsulation';
import { SquareScene } from './SquareScene';
import './styles.css';

const SCENES = [
  { value: 'dispatch', label: 'Method dispatch' },
  { value: 'encapsulation', label: 'Encapsulation' },
  { value: 'composition', label: 'Inherit vs compose' },
  { value: 'square', label: 'Is a Square a Rect?' },
] as const;

type Scene = (typeof SCENES)[number]['value'];

export function Stage() {
  const [scene, picker] = useScenePicker<Scene>({ label: 'Scene', options: [...SCENES], initial: 'dispatch' });
  if (scene === 'encapsulation') return <Encapsulation picker={picker} />;
  if (scene === 'composition') return <Composition picker={picker} />;
  if (scene === 'square') return <SquareScene picker={picker} />;
  return <Dispatch picker={picker} />;
}
