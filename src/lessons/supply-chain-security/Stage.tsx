import { useScenePicker } from '../../components/ScenePicker';
import { IntegrityScene } from './IntegrityScene';
import { MatrixScene } from './MatrixScene';
import { OPENING_SCENE, type SceneId } from './opening';
import { ProvenanceScene } from './ProvenanceScene';
import { SpreadScene } from './SpreadScene';
import './styles.css';

const SCENES: { value: SceneId; label: string }[] = [
  { value: 'spread', label: 'Propagation and the lockfile' },
  { value: 'integrity', label: 'Integrity' },
  { value: 'matrix', label: 'Attack classes' },
  { value: 'provenance', label: 'Provenance and the SBOM' },
];

export function Stage() {
  const [scene, picker] = useScenePicker<SceneId>({ label: 'Scene', options: SCENES, initial: OPENING_SCENE });
  if (scene === 'integrity') return <IntegrityScene key="integrity" picker={picker} />;
  if (scene === 'matrix') return <MatrixScene key="matrix" picker={picker} />;
  if (scene === 'provenance') return <ProvenanceScene key="provenance" picker={picker} />;
  return <SpreadScene key="spread" picker={picker} />;
}
