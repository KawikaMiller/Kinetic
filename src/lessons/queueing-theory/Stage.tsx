import { useScenePicker } from '../../components/ScenePicker';
import { CurveScene } from './CurveScene';
import { LittleScene } from './LittleScene';
import { LiveScene } from './LiveScene';
import { PoolScene } from './PoolScene';
import './styles.css';

type Scene = 'live' | 'little' | 'pool' | 'curve';
const SCENES: { value: Scene; label: string }[] = [
  { value: 'live', label: 'One server' },
  { value: 'little', label: "Little's Law" },
  { value: 'pool', label: 'Fast server or a pool?' },
  { value: 'curve', label: 'The curve' },
];

export function Stage() {
  const [scene, picker] = useScenePicker<Scene>({ label: 'Scene', options: SCENES, initial: 'live' });
  if (scene === 'little') return <LittleScene picker={picker} />;
  if (scene === 'pool') return <PoolScene picker={picker} />;
  if (scene === 'curve') return <CurveScene picker={picker} />;
  return <LiveScene picker={picker} />;
}
