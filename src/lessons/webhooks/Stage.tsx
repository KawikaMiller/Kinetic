import { useScenePicker } from '../../components/ScenePicker';
import { FastScene } from './FastScene';
import { OrderScene } from './OrderScene';
import { RetryScene } from './RetryScene';
import { SignatureScene } from './SignatureScene';
import './styles.css';

type SceneId = 'signature' | 'retries' | 'order' | 'fast';
const SCENES: { value: SceneId; label: string }[] = [
  { value: 'signature', label: 'Signatures' },
  { value: 'retries', label: 'Receiver offline' },
  { value: 'order', label: 'Duplicates & order' },
  { value: 'fast', label: 'Reply fast' },
];

export function Stage() {
  const [scene, picker] = useScenePicker({ label: 'Scene', options: SCENES, initial: 'signature' });
  if (scene === 'retries') return <RetryScene picker={picker} />;
  if (scene === 'order') return <OrderScene picker={picker} />;
  if (scene === 'fast') return <FastScene picker={picker} />;
  return <SignatureScene picker={picker} />;
}
