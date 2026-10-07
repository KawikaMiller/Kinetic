import { useState } from 'react';
import { useScenePicker } from '../../components/ScenePicker';
import { StageFrame } from '../../components/StageFrame';
import { hasSubtle } from '../../core/crypto';
import { ChainScene } from './ChainScene';
import { randomBytes } from './ciphers';
import { PictureScene } from './PictureScene';
import { ReuseScene } from './ReuseScene';
import { TamperScene } from './TamperScene';
import './styles.css';

type Scene = 'picture' | 'chain' | 'reuse' | 'tamper';
const SCENES: { value: Scene; label: string }[] = [
  { value: 'picture', label: 'Picture' },
  { value: 'chain', label: 'Chaining' },
  { value: 'reuse', label: 'IV reuse' },
  { value: 'tamper', label: 'Tamper' },
];
const KEY_BYTES = 16;

export function Stage() {
  const [scene, picker] = useScenePicker<Scene>({ label: 'Lane', options: SCENES, initial: 'picture' });
  // One AES-128 key, generated in the browser when the lesson opens and shared by every lane.
  const [key] = useState(() => (hasSubtle() ? randomBytes(KEY_BYTES) : null));
  if (!key) {
    return (
      <StageFrame controls={[picker]}>
        <p className="stage-pad sc-error">
          Web Crypto isn't available here (it needs https or localhost), so this lesson has no real AES to show, and it won't draw fake
          noise instead.
        </p>
      </StageFrame>
    );
  }
  if (scene === 'chain') return <ChainScene picker={picker} aesKey={key} />;
  if (scene === 'reuse') return <ReuseScene picker={picker} aesKey={key} />;
  if (scene === 'tamper') return <TamperScene picker={picker} aesKey={key} />;
  return <PictureScene picker={picker} aesKey={key} />;
}
