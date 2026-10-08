import { useScenePicker } from '../../components/ScenePicker';
import { KeyScene } from './KeyScene';
import { PatternScene } from './PatternScene';
import { RaceScene } from './RaceScene';
import { StampedeScene } from './StampedeScene';
import { TtlScene } from './TtlScene';
import './styles.css';

type SceneId = 'patterns' | 'races' | 'ttl' | 'stampede' | 'keys';
const SCENES: { value: SceneId; label: string }[] = [
  { value: 'patterns', label: 'Patterns' },
  { value: 'races', label: 'Stale-data races' },
  { value: 'ttl', label: 'TTL trade-off' },
  { value: 'stampede', label: 'Hot key expiry' },
  { value: 'keys', label: 'Cache keys' },
];

export function Stage() {
  const [scene, picker] = useScenePicker({ label: 'Scene', options: SCENES, initial: 'patterns' });
  switch (scene) {
    case 'races': return <RaceScene picker={picker} />;
    case 'ttl': return <TtlScene picker={picker} />;
    case 'stampede': return <StampedeScene picker={picker} />;
    case 'keys': return <KeyScene picker={picker} />;
    default: return <PatternScene picker={picker} />;
  }
}
