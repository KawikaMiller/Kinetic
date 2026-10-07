import { useScenePicker } from '../../components/ScenePicker';
import { ChunkScene } from './ChunkScene';
import { SearchScene } from './SearchScene';
import './styles.css';

const SCENES = [
  { value: 'search' as const, label: 'Rabin-Karp search' },
  { value: 'chunks' as const, label: 'Chunking' },
];

export function Stage() {
  const [scene, picker] = useScenePicker({ label: 'Scene', options: SCENES, initial: 'search' });
  return scene === 'chunks' ? <ChunkScene picker={picker} /> : <SearchScene picker={picker} />;
}
