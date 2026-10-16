import { useState } from 'react';
import { useScenePicker } from '../../components/ScenePicker';
import { AskScene } from './AskScene';
import { CombineScene } from './CombineScene';
import { CountScene } from './CountScene';
import { DisagreeScene } from './DisagreeScene';
import { OPENING, type SceneId } from './opening';
import './styles.css';

const SCENES: { value: SceneId; label: string }[] = [
  { value: 'ask', label: 'Ask the system' },
  { value: 'disagree', label: 'Where models disagree' },
  { value: 'count', label: 'What an administrator defines' },
  { value: 'combine', label: 'Combining rules' },
];

export function Stage() {
  const [scene, picker] = useScenePicker<SceneId>({ label: 'Scene', options: SCENES, initial: OPENING.scene });
  // The first two scenes ask about one organisation, so an edit made in one shows in the other.
  const [org, setOrg] = useState(OPENING.org);
  if (scene === 'disagree') return <DisagreeScene key="disagree" picker={picker} org={org} setOrg={setOrg} />;
  if (scene === 'count') return <CountScene key="count" picker={picker} />;
  if (scene === 'combine') return <CombineScene key="combine" picker={picker} />;
  return <AskScene key="ask" picker={picker} org={org} setOrg={setOrg} />;
}
