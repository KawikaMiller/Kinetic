import { useScenePicker } from '../../components/ScenePicker';
import { IceScene } from './IceScene';
import { PunchScene } from './PunchScene';
import { RelayScene } from './RelayScene';
import { StunScene } from './StunScene';
import './styles.css';

type Scene = 'stun' | 'punch' | 'relay' | 'ice';
const SCENES: { value: Scene; label: string }[] = [
  { value: 'stun', label: 'Who am I from outside?' },
  { value: 'punch', label: 'Hole punching' },
  { value: 'relay', label: 'The relay' },
  { value: 'ice', label: 'ICE' },
];

export function Stage() {
  const [scene, picker] = useScenePicker<Scene>({ label: 'Scene', options: SCENES, initial: 'stun' });
  if (scene === 'punch') return <PunchScene key={scene} picker={picker} />;
  if (scene === 'relay') return <RelayScene key={scene} picker={picker} />;
  if (scene === 'ice') return <IceScene key={scene} picker={picker} />;
  return <StunScene key={scene} picker={picker} />;
}
