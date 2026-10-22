import { useScenePicker } from '../../components/ScenePicker';
import { FacadeScene } from './FacadeScene';
import { LedgerScene } from './LedgerScene';
import { OPENING, type SceneId } from './opening';
import { StoryScene } from './StoryScene';
import './styles.css';

const SCENES: { value: SceneId; label: string }[] = [
  { value: 'facade', label: 'The facade' },
  { value: 'story', label: 'What first?' },
  { value: 'ledger', label: 'Read the ledger' },
];

export function Stage() {
  const [scene, picker] = useScenePicker<SceneId>({ label: 'Scene', options: SCENES, initial: OPENING.scene });
  if (scene === 'story') return <StoryScene key="story" picker={picker} />;
  if (scene === 'ledger') return <LedgerScene key="ledger" picker={picker} />;
  return <FacadeScene key="facade" picker={picker} />;
}
