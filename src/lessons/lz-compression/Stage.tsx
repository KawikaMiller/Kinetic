import { useScenePicker } from '../../components/ScenePicker';
import { CanonicalScene } from './CanonicalScene';
import { DecodeScene } from './DecodeScene';
import { DeflateScene } from './DeflateScene';
import { TokensScene } from './TokensScene';
import { useParseSettings } from './useParseSettings';
import { WhereScene } from './WhereScene';
import './styles.css';

type Scene = 'tokens' | 'decode' | 'canonical' | 'deflate' | 'where';
const SCENES: { value: Scene; label: string }[] = [
  { value: 'tokens', label: 'LZ77 tokens' },
  { value: 'decode', label: 'Decode' },
  { value: 'canonical', label: 'Canonical codes' },
  { value: 'deflate', label: 'A real DEFLATE block' },
  { value: 'where', label: 'Where each idea works' },
];

export function Stage() {
  const [scene, picker] = useScenePicker<Scene>({ label: 'Scene', options: SCENES, initial: 'tokens' });
  const settings = useParseSettings();
  if (scene === 'decode') return <DecodeScene picker={picker} s={settings} />;
  if (scene === 'canonical') return <CanonicalScene picker={picker} />;
  if (scene === 'deflate') return <DeflateScene picker={picker} s={settings} />;
  if (scene === 'where') return <WhereScene picker={picker} s={settings} />;
  return <TokensScene picker={picker} s={settings} />;
}
