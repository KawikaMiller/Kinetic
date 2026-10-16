import { useScenePicker } from '../../components/ScenePicker';
import { CoherenceScene } from './CoherenceScene';
import { MmioScene } from './MmioScene';
import { RingScene } from './RingScene';
import { TransferScene } from './TransferScene';
import './styles.css';

type Scene = 'transfer' | 'mmio' | 'ring' | 'cache';
const SCENES: { value: Scene; label: string }[] = [
  { value: 'transfer', label: 'Three ways to move a block' },
  { value: 'mmio', label: 'A device is an address' },
  { value: 'ring', label: 'The descriptor ring' },
  { value: 'cache', label: 'DMA and the cache' },
];

export function Stage() {
  const [scene, picker] = useScenePicker<Scene>({ label: 'Scene', options: SCENES, initial: 'transfer' });
  if (scene === 'mmio') return <MmioScene key={scene} picker={picker} />;
  if (scene === 'ring') return <RingScene key={scene} picker={picker} />;
  if (scene === 'cache') return <CoherenceScene key={scene} picker={picker} />;
  return <TransferScene key={scene} picker={picker} />;
}
