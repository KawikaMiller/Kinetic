import { useScenePicker } from '../../components/ScenePicker';
import { FactorsScene, PathsScene } from './FactorsScene';
import { PhishScene } from './PhishScene';
import { TotpScene } from './TotpScene';
import './styles.css';

type Scene = 'factors' | 'totp' | 'phish' | 'recovery';

const SCENES: { value: Scene; label: string }[] = [
  { value: 'factors', label: '① Factors' },
  { value: 'totp', label: '② TOTP codes' },
  { value: 'phish', label: '③ Phishing' },
  { value: 'recovery', label: '④ Recovery' },
];

export function Stage() {
  const [scene, picker] = useScenePicker({ label: 'Scene', options: SCENES, initial: 'factors' });
  // Each scene owns its own StageFrame, so switching remounts cleanly.
  if (scene === 'totp') return <TotpScene picker={picker} />;
  if (scene === 'phish') return <PhishScene picker={picker} />;
  if (scene === 'recovery') return <PathsScene picker={picker} />;
  return <FactorsScene picker={picker} />;
}
