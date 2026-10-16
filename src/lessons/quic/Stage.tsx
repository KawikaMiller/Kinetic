import { useScenePicker } from '../../components/ScenePicker';
import { EarlyScene } from './EarlyScene';
import { HandshakeScene } from './HandshakeScene';
import { HolScene } from './HolScene';
import { MigrateScene } from './MigrateScene';
import './styles.css';

type Scene = 'handshake' | 'early' | 'hol' | 'migrate';
const SCENES: { value: Scene; label: string }[] = [
  { value: 'handshake', label: 'Round trips' },
  { value: 'early', label: 'What 0-RTT costs' },
  { value: 'hol', label: 'Head-of-line blocking' },
  { value: 'migrate', label: 'Migration' },
];

export function Stage() {
  const [scene, picker] = useScenePicker<Scene>({ label: 'Scene', options: SCENES, initial: 'handshake' });
  if (scene === 'early') return <EarlyScene key={scene} picker={picker} />;
  if (scene === 'hol') return <HolScene key={scene} picker={picker} />;
  if (scene === 'migrate') return <MigrateScene key={scene} picker={picker} />;
  return <HandshakeScene key={scene} picker={picker} />;
}
