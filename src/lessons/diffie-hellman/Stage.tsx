import { useScenePicker } from '../../components/ScenePicker';
import { NumbersScene } from './NumbersScene';
import { PaintScene } from './PaintScene';
import { RealScene } from './RealScene';
import './styles.css';

type Scene = 'paint' | 'numbers' | 'real';
const SCENES: { value: Scene; label: string }[] = [
  { value: 'paint', label: 'Paint' },
  { value: 'numbers', label: 'Numbers' },
  { value: 'real', label: 'Real ECDH' },
];

export function Stage() {
  const [scene, picker] = useScenePicker<Scene>({ label: 'Lane', options: SCENES, initial: 'paint' });
  if (scene === 'numbers') return <NumbersScene picker={picker} />;
  if (scene === 'real') return <RealScene picker={picker} />;
  return <PaintScene picker={picker} />;
}
