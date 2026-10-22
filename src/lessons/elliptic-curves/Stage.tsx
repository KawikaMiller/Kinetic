import { useScenePicker } from '../../components/ScenePicker';
import { BrowserScene } from './BrowserScene';
import { FieldScene } from './FieldScene';
import { RealScene } from './RealScene';
import { ScalarScene } from './ScalarScene';
import './styles.css';

type Scene = 'real' | 'field' | 'scalar' | 'browser';
const SCENES: { value: Scene; label: string }[] = [
  { value: 'real', label: 'Chord and tangent' },
  { value: 'field', label: 'Finite field' },
  { value: 'scalar', label: 'Scalar multiplication' },
  { value: 'browser', label: 'Your browser' },
];

export function Stage() {
  const [scene, picker] = useScenePicker<Scene>({ label: 'Scene', options: SCENES, initial: 'real' });
  if (scene === 'field') return <FieldScene key="field" picker={picker} />;
  if (scene === 'scalar') return <ScalarScene key="scalar" picker={picker} />;
  if (scene === 'browser') return <BrowserScene key="browser" picker={picker} />;
  return <RealScene key="real" picker={picker} />;
}
