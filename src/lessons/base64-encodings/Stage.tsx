import { useState } from 'react';
import { Segmented } from '../../components/ui';
import { Base64Lane } from './Base64Lane';
import { PercentLane } from './PercentLane';
import './styles.css';

type Lane = 'base64' | 'percent';

export function Stage() {
  const [lane, setLane] = useState<Lane>('base64');
  const picker = (
    <Segmented label="Encoding" value={lane} onChange={setLane} options={[{ value: 'base64', label: 'Base64' }, { value: 'percent', label: 'URL / percent' }]} />
  );
  return lane === 'base64' ? <Base64Lane lanePicker={picker} /> : <PercentLane lanePicker={picker} />;
}
