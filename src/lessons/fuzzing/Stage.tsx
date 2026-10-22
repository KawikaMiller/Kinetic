import { useScenePicker } from '../../components/ScenePicker';
import { CorpusScene } from './CorpusScene';
import { CrashScene } from './CrashScene';
import { OracleScene } from './OracleScene';
import { OPENING_SCENE, type SceneId } from './opening';
import { RaceScene } from './RaceScene';
import './styles.css';

const SCENES: { value: SceneId; label: string }[] = [
  { value: 'race', label: 'Blind vs guided' },
  { value: 'corpus', label: 'The corpus' },
  { value: 'crash', label: 'A crash' },
  { value: 'oracle', label: 'No oracle, no bug' },
];

export function Stage() {
  const [scene, picker] = useScenePicker<SceneId>({ label: 'Scene', options: SCENES, initial: OPENING_SCENE });
  if (scene === 'corpus') return <CorpusScene key="corpus" picker={picker} />;
  if (scene === 'crash') return <CrashScene key="crash" picker={picker} />;
  if (scene === 'oracle') return <OracleScene key="oracle" picker={picker} />;
  return <RaceScene key="race" picker={picker} />;
}
