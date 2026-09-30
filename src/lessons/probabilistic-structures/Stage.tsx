import { useState } from 'react';
import { Segmented } from '../../components/ui';
import { BloomView } from './BloomView';
import { HllView } from './HllView';
import './styles.css';

type View = 'bloom' | 'hll';

export function Stage() {
  const [view, setView] = useState<View>('bloom');
  const switcher = (
    <Segmented
      label="Structure"
      value={view}
      onChange={setView}
      options={[
        { value: 'bloom', label: 'Bloom filter' },
        { value: 'hll', label: 'HyperLogLog' },
      ]}
    />
  );
  return view === 'bloom' ? <BloomView switcher={switcher} /> : <HllView switcher={switcher} />;
}
