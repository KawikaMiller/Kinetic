import { useState } from 'react';
import { useScenePicker } from '../../components/ScenePicker';
import { EncryptScene } from './EncryptScene';
import { KeygenScene } from './KeygenScene';
import { DEFAULT_PARAMS, keygen, type RsaKey, type RsaParams } from './model';
import { SignScene } from './SignScene';
import { SizeScene } from './SizeScene';
import './styles.css';

type Scene = 'keygen' | 'encrypt' | 'sign' | 'size';
const SCENES: { value: Scene; label: string }[] = [
  { value: 'keygen', label: 'Make a key' },
  { value: 'encrypt', label: 'Encrypt' },
  { value: 'sign', label: 'Sign' },
  { value: 'size', label: 'Key size' },
];

export function Stage() {
  const [scene, picker] = useScenePicker<Scene>({ label: 'Lane', options: SCENES, initial: 'keygen' });
  // The last parameters tried (keygen shows them, failures included) and the last valid key,
  // which the other lanes keep using.
  const [params, setParams] = useState<RsaParams>(DEFAULT_PARAMS);
  const [key, setKey] = useState<RsaKey>(() => keygen(DEFAULT_PARAMS).key!);
  const tryParams = (next: RsaParams) => {
    setParams(next);
    const made = keygen(next).key;
    if (made) setKey(made);
  };

  if (scene === 'encrypt') return <EncryptScene picker={picker} rsaKey={key} />;
  if (scene === 'sign') return <SignScene picker={picker} rsaKey={key} />;
  if (scene === 'size') return <SizeScene picker={picker} rsaKey={key} />;
  return <KeygenScene picker={picker} params={params} rsaKey={key} onParams={tryParams} />;
}
