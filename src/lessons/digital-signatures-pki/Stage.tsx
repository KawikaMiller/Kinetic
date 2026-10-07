import { useScenePicker } from '../../components/ScenePicker';
import { ChainScene } from './ChainScene';
import { SignScene } from './SignScene';
import './styles.css';

type Scene = 'sign' | 'chain';
const SCENES: { value: Scene; label: string }[] = [
  { value: 'sign', label: 'Sign & verify' },
  { value: 'chain', label: 'Certificate chain' },
];

export function Stage() {
  const [scene, picker] = useScenePicker<Scene>({ label: 'Lane', options: SCENES, initial: 'sign' });
  return scene === 'chain' ? <ChainScene picker={picker} /> : <SignScene picker={picker} />;
}
