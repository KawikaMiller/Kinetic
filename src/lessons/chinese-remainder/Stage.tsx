import { useScenePicker } from '../../components/ScenePicker';
import { BuildScene } from './BuildScene';
import { GearsScene } from './GearsScene';
import { ResidueScene } from './ResidueScene';
import { SharedScene } from './SharedScene';
import { SpeedScene } from './SpeedScene';
import './styles.css';

type Scene = 'gears' | 'build' | 'shared' | 'residue' | 'speed';
const SCENES: { value: Scene; label: string }[] = [
  { value: 'gears', label: 'The gears' },
  { value: 'build', label: 'Build it' },
  { value: 'shared', label: 'A shared factor' },
  { value: 'residue', label: 'Residue arithmetic' },
  { value: 'speed', label: 'What it buys' },
];

export function Stage() {
  const [scene, picker] = useScenePicker<Scene>({ label: 'Scene', options: SCENES, initial: 'gears' });
  if (scene === 'build') return <BuildScene key="build" picker={picker} />;
  if (scene === 'shared') return <SharedScene key="shared" picker={picker} />;
  if (scene === 'residue') return <ResidueScene key="residue" picker={picker} />;
  if (scene === 'speed') return <SpeedScene key="speed" picker={picker} />;
  return <GearsScene key="gears" picker={picker} />;
}
