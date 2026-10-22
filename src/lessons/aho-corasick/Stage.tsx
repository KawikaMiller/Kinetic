import { useScenePicker } from '../../components/ScenePicker';
import { LinksScene } from './LinksScene';
import { StreamScene } from './StreamScene';
import { TrieScene } from './TrieScene';
import { WorkScene } from './WorkScene';
import './styles.css';

type Scene = 'trie' | 'links' | 'stream' | 'work';
const SCENES: { value: Scene; label: string }[] = [
  { value: 'trie', label: 'The trie' },
  { value: 'links', label: 'Failure links, by hand' },
  { value: 'stream', label: 'Stream the text' },
  { value: 'work', label: 'Count the work' },
];

export function Stage() {
  const [scene, picker] = useScenePicker<Scene>({ label: 'Scene', options: SCENES, initial: 'stream' });
  if (scene === 'trie') return <TrieScene key="trie" picker={picker} />;
  if (scene === 'links') return <LinksScene key="links" picker={picker} />;
  if (scene === 'work') return <WorkScene key="work" picker={picker} />;
  return <StreamScene key="stream" picker={picker} />;
}
