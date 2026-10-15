import { useScenePicker } from '../../components/ScenePicker';
import { BytesScene } from './BytesScene';
import { CardsScene } from './CardsScene';
import { ImportsScene } from './ImportsScene';
import { MemoryScene } from './MemoryScene';
import { StackScene } from './StackScene';
import './styles.css';

const SCENES = [
  { value: 'bytes', label: 'From source to bytes' },
  { value: 'stack', label: 'A stack machine, stepped' },
  { value: 'memory', label: 'The boundary' },
  { value: 'imports', label: 'What the module may touch' },
  { value: 'cards', label: 'What it is not' },
] as const;

export function Stage() {
  const [scene, picker] = useScenePicker({ label: 'Scene', options: [...SCENES], initial: 'bytes' });
  if (scene === 'stack') return <StackScene picker={picker} />;
  if (scene === 'memory') return <MemoryScene picker={picker} />;
  if (scene === 'imports') return <ImportsScene picker={picker} />;
  if (scene === 'cards') return <CardsScene picker={picker} />;
  return <BytesScene picker={picker} />;
}
