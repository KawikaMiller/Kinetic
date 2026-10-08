import { useScenePicker } from '../../components/ScenePicker';
import { HddScene } from './HddScene';
import { NvmeScene } from './NvmeScene';
import { SsdScene } from './SsdScene';
import './styles.css';

type Scene = 'hdd' | 'ssd' | 'nvme';

export function Stage() {
  const [scene, picker] = useScenePicker<Scene>({
    label: 'Scene',
    options: [
      { value: 'hdd', label: 'Hard disk' },
      { value: 'ssd', label: 'SSD flash' },
      { value: 'nvme', label: 'Queues & latency' },
    ],
    initial: 'hdd',
  });
  if (scene === 'ssd') return <SsdScene picker={picker} />;
  if (scene === 'nvme') return <NvmeScene picker={picker} />;
  return <HddScene picker={picker} />;
}
